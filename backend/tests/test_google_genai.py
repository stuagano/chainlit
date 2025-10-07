import asyncio
import sys
import types
from typing import Any, Dict, List

import pytest

from chainlit.context import ChainlitContext, context_var


class _FakeResponse:
    def __init__(self, model: str, text: str):
        self.model = model
        self.output_text = text
        self.text = text
        self.candidates: List[Any] = []


class _FakeResponses:
    def __init__(self):
        self.calls: List[Dict[str, Any]] = []

    def generate(self, *, model: str, contents: str):
        self.calls.append({"model": model, "contents": contents})
        return _FakeResponse(model=model, text=f"echo:{contents}")


class _FakeClient:
    def __init__(self, *_, **__):
        self.responses = _FakeResponses()


@pytest.fixture
async def chainlit_context(mock_session):
    context = ChainlitContext(mock_session)
    token = context_var.set(context)
    try:
        yield context
    finally:
        context_var.reset(token)


@pytest.fixture(autouse=True)
def cleanup_google_modules():
    originals = {k: v for k, v in sys.modules.items() if k.startswith("google")}
    for key in list(sys.modules.keys()):
        if key.startswith("google"):
            del sys.modules[key]
    try:
        yield
    finally:
        for key in list(sys.modules.keys()):
            if key.startswith("google") and key not in originals:
                del sys.modules[key]
        sys.modules.update(originals)


@pytest.mark.asyncio
async def test_instrument_google_genai_records_step(monkeypatch, chainlit_context):
    google_pkg = types.ModuleType("google")
    genai_pkg = types.ModuleType("google.genai")
    genai_pkg.Client = _FakeClient
    google_pkg.genai = genai_pkg
    sys.modules["google"] = google_pkg
    sys.modules["google.genai"] = genai_pkg

    recorded_steps = []

    async def fake_send(self):  # type: ignore[override]
        recorded_steps.append(
            {
                "name": self.name,
                "input": self.input,
                "output": self.output,
                "metadata": self.metadata,
            }
        )
        return self

    monkeypatch.setattr("chainlit.step.Step.send", fake_send, raising=False)

    from chainlit.google import instrument_google_genai

    instrument_google_genai()

    from google import genai

    client = genai.Client(api_key="test")
    response = client.responses.generate(
        model="models/gemini-test",
        contents="hello world",
    )

    assert response.output_text == "echo:hello world"

    # Let the instrumentation task execute.
    await asyncio.sleep(0)

    assert recorded_steps
    step = recorded_steps[0]
    assert step["name"] == "models/gemini-test"
    assert step["input"] == "hello world"
    assert step["output"] == "echo:hello world"
    assert step["metadata"]["provider"] == "google"
    assert step["metadata"]["interface"] == "responses"
    assert step["metadata"]["method"] == "generate"
