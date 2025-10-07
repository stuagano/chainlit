"""Utilities to instrument the Google GenAI SDK.

The instrumentation hooks into the official ``google-genai`` (or legacy
``google-generativeai``) SDK so that calls performed inside a Chainlit
application automatically create LLM steps in the UI. It works with either
Gemini API keys or Vertex AI credentials - whichever is configured when the
SDK client is instantiated. The same hooks also cover Agent Developer Kit
(ADK) calls that rely on the ``agents`` surface of the SDK.
"""

from __future__ import annotations

import asyncio
import inspect
import time
from typing import Any, Callable, Dict, Iterable, Optional

from chainlit.context import ChainlitContextException, get_context, local_steps
from chainlit.step import Step
from chainlit.utils import timestamp_utc

_STEP_SENTINEL_ATTR = "__chainlit_google_instrumented__"


def instrument_google_genai() -> None:
    """Instrument the Google GenAI SDK if it is available.

    The function is intentionally import tolerant: it first tries to locate the
    new ``google-genai`` package (imported via ``from google import genai``) and
    falls back to the legacy ``google.generativeai`` package. When the module is
    missing, a :class:`ValueError` is raised to provide actionable feedback to
    the developer.
    """

    sdk, client_class, async_client_class = _locate_google_sdk()

    if client_class is None and async_client_class is None:
        raise ValueError(
            "Expected either google-genai (preferred) or google-generativeai to be "
            "installed. Install one of them to enable Chainlit's Google "
            "instrumentation."
        )

    if client_class is not None:
        _patch_client_class(client_class)

    if async_client_class is not None:
        _patch_client_class(async_client_class)


def _locate_google_sdk():
    """Return the loaded Google GenAI SDK module and client classes."""

    try:
        from google import genai as sdk  # type: ignore
    except Exception:
        sdk = None

    client_class = getattr(sdk, "Client", None) if sdk else None
    async_client_class = getattr(sdk, "AsyncClient", None) if sdk else None

    if client_class or async_client_class:
        return sdk, client_class, async_client_class

    # Fall back to the legacy SDK if present.
    try:
        import google.generativeai as legacy_sdk  # type: ignore
    except Exception:
        legacy_sdk = None

    if legacy_sdk is None:
        return None, None, None

    # The legacy package exposes top-level helpers instead of a dedicated
    # client class. We therefore build a thin shim so that instrumentation
    # can still operate by patching the helper functions.
    _patch_legacy_sdk(legacy_sdk)
    return legacy_sdk, None, None


def _patch_client_class(client_cls: type) -> None:
    if getattr(client_cls, _STEP_SENTINEL_ATTR, False):
        return

    original_init = client_cls.__init__

    def wrapped_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        _instrument_client_instance(self)

    client_cls.__init__ = wrapped_init  # type: ignore
    setattr(client_cls, _STEP_SENTINEL_ATTR, True)


def _patch_legacy_sdk(legacy_sdk: Any) -> None:
    if getattr(legacy_sdk, _STEP_SENTINEL_ATTR, False):
        return

    generate_fns = []

    for candidate_name in (
        "generate_text",
        "generate_content",
        "generate_message",
    ):
        candidate = getattr(legacy_sdk, candidate_name, None)
        if candidate:
            generate_fns.append((candidate_name, candidate))

    for name, fn in generate_fns:
        if getattr(fn, _STEP_SENTINEL_ATTR, False):
            continue
        wrapped = _wrap_callable(fn, interface="legacy", method=name)
        setattr(legacy_sdk, name, wrapped)
        setattr(wrapped, _STEP_SENTINEL_ATTR, True)

    setattr(legacy_sdk, _STEP_SENTINEL_ATTR, True)


def _instrument_client_instance(client: Any) -> None:
    for attr_name, method_names in {
        "responses": ("generate",),
        "models": ("generate_content", "generate", "create_completion"),
        "agents": (
            "create",
            "update",
            "delete",
            "execute",
            "query",
        ),
        "sessions": ("generate", "generate_content", "execute"),
        "tools": ("execute",),
    }.items():
        component = getattr(client, attr_name, None)
        if not component:
            continue

        for method_name in method_names:
            method = getattr(component, method_name, None)
            if method is None:
                continue
            if getattr(method, _STEP_SENTINEL_ATTR, False):
                continue

            wrapped = _wrap_bound_method(
                method, interface=attr_name, method=method_name
            )
            setattr(component, method_name, wrapped)
            setattr(getattr(component, method_name), _STEP_SENTINEL_ATTR, True)


def _wrap_bound_method(
    bound_method: Callable[..., Any], *, interface: str, method: str
):
    is_coroutine = asyncio.iscoroutinefunction(bound_method)

    async def _async_wrapper(*args, **kwargs):
        start = time.time()
        result = await bound_method(*args, **kwargs)
        _record_generation(interface, method, args, kwargs, result, start)
        return result

    def _sync_wrapper(*args, **kwargs):
        start = time.time()
        result = bound_method(*args, **kwargs)

        if inspect.isawaitable(result):
            async def _await_and_record():
                awaited = await result
                _record_generation(interface, method, args, kwargs, awaited, start)
                return awaited

            return _await_and_record()

        if inspect.isgenerator(result) or inspect.isasyncgen(result):
            return result

        _record_generation(interface, method, args, kwargs, result, start)
        return result

    return _async_wrapper if is_coroutine else _sync_wrapper


def _wrap_callable(
    callable_obj: Callable[..., Any], *, interface: str, method: str
):
    is_coroutine = asyncio.iscoroutinefunction(callable_obj)

    async def _async_wrapper(*args, **kwargs):
        start = time.time()
        result = await callable_obj(*args, **kwargs)
        _record_generation(interface, method, args, kwargs, result, start)
        return result

    def _sync_wrapper(*args, **kwargs):
        start = time.time()
        result = callable_obj(*args, **kwargs)

        if inspect.isawaitable(result):
            async def _await_and_record():
                awaited = await result
                _record_generation(interface, method, args, kwargs, awaited, start)
                return awaited

            return _await_and_record()

        if inspect.isgenerator(result) or inspect.isasyncgen(result):
            return result

        _record_generation(interface, method, args, kwargs, result, start)
        return result

    return _async_wrapper if is_coroutine else _sync_wrapper


def _record_generation(
    interface: str,
    method: str,
    args: Iterable[Any],
    kwargs: Dict[str, Any],
    result: Any,
    start_time: float,
) -> None:
    try:
        ctx = get_context()
    except ChainlitContextException:
        ctx = None

    parent_id: Optional[str] = None
    if ctx and ctx.current_step:
        parent_id = ctx.current_step.id
    elif (previous_steps := local_steps.get() or []) and previous_steps:
        parent_id = previous_steps[-1].id

    model = _extract_model(args, kwargs, result)
    prompt = _extract_prompt(args, kwargs)
    output = _extract_output(result)

    end_time = time.time()

    step = Step(
        name=model or _default_step_name(interface, method),
        type="llm",
        parent_id=parent_id,
        metadata={
            "provider": "google",
            "interface": interface,
            "method": method,
        },
    )
    step.input = (
        prompt
        if prompt is not None
        else {"args": _simplify(args), "kwargs": _simplify(kwargs)}
    )
    step.output = output
    step.start = timestamp_utc(start_time)
    step.end = timestamp_utc(end_time)

    asyncio.create_task(step.send())


def _default_step_name(interface: str, method: str) -> str:
    return f"google::{interface}.{method}"


def _extract_model(args: Iterable[Any], kwargs: Dict[str, Any], result: Any) -> Optional[str]:
    if "model" in kwargs and isinstance(kwargs["model"], str):
        return kwargs["model"]

    for value in args:
        if isinstance(value, str) and value.startswith("models/"):
            return value
        if isinstance(value, dict) and isinstance(value.get("model"), str):
            return value["model"]

    for attr in ("model", "model_name", "model_version"):
        candidate = getattr(result, attr, None)
        if isinstance(candidate, str):
            return candidate

    return None


def _extract_prompt(args: Iterable[Any], kwargs: Dict[str, Any]) -> Any:
    for key in ("contents", "messages", "prompt", "input", "text"):
        if key in kwargs:
            return _simplify(kwargs[key])

    for value in args:
        if isinstance(value, (str, list, dict)):
            return _simplify(value)

    return None


def _extract_output(result: Any) -> Any:
    if result is None:
        return None

    for attr in ("output_text", "text", "response_text"):
        candidate = getattr(result, attr, None)
        if isinstance(candidate, str) and candidate:
            return candidate

    if hasattr(result, "candidates"):
        texts = []
        try:
            for candidate in result.candidates:  # type: ignore[attr-defined]
                content = getattr(candidate, "content", None)
                if content is None:
                    continue
                parts = getattr(content, "parts", None)
                if parts is None:
                    continue
                for part in parts:
                    text = getattr(part, "text", None)
                    if text:
                        texts.append(text)
        except Exception:
            pass
        if texts:
            return "\n".join(texts)

    if hasattr(result, "response") and hasattr(result.response, "output_text"):
        try:
            response = result.response
            output_text = getattr(response, "output_text", None)
            if isinstance(output_text, str):
                return output_text
        except Exception:
            pass

    if isinstance(result, (str, int, float, bool)):
        return result

    return _simplify(result)


def _simplify(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _simplify(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_simplify(v) for v in value]
    if hasattr(value, "__dict__"):
        return {
            key: _simplify(val)
            for key, val in vars(value).items()
            if not key.startswith("_")
        }
    if hasattr(value, "model_dump"):
        try:
            return _simplify(value.model_dump())  # type: ignore[attr-defined]
        except Exception:
            pass
    return repr(value)
