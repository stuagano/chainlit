import { sanitizeRichText } from '@/lib/agentEditor';
import { cn } from '@/lib/utils';
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  Strikethrough,
  Underline,
  Undo
} from 'lucide-react';
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

type CommandKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertOrderedList'
  | 'insertUnorderedList';

type CommandState = Record<CommandKey, boolean>;

const COMMAND_KEYS: CommandKey[] = [
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'insertOrderedList',
  'insertUnorderedList'
];

const INITIAL_COMMAND_STATE: CommandState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  insertOrderedList: false,
  insertUnorderedList: false
};

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

const ToolbarButton = ({
  icon,
  label,
  onClick,
  active,
  disabled
}: ToolbarButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    aria-pressed={active}
    title={label}
    disabled={disabled}
    className={cn(
      'size-8 text-muted-foreground hover:text-foreground',
      active ? 'bg-muted text-foreground' : undefined
    )}
  >
    {icon}
  </Button>
);

export const RichTextEditor = ({
  value,
  onChange,
  placeholder
}: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [commandState, setCommandState] = useState<CommandState>(
    INITIAL_COMMAND_STATE
  );
  const [isEmpty, setIsEmpty] = useState(() => !value?.trim());

  const updateCommandState = useCallback(() => {
    if (typeof document === 'undefined') return;

    const nextState = { ...INITIAL_COMMAND_STATE };
    COMMAND_KEYS.forEach((command) => {
      try {
        nextState[command] = document.queryCommandState(command);
      } catch (_error) {
        nextState[command] = false;
      }
    });
    setCommandState(nextState);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.addEventListener('selectionchange', updateCommandState);
    return () => {
      document.removeEventListener('selectionchange', updateCommandState);
    };
  }, [updateCommandState]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML === value) return;
    editorRef.current.innerHTML = value || '';
    const textContent = editorRef.current.textContent || '';
    setIsEmpty(textContent.trim().length === 0);
    updateCommandState();
  }, [value, updateCommandState]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeRichText(editor.innerHTML);
    if (sanitized !== editor.innerHTML) {
      editor.innerHTML = sanitized;
    }
    const textContent = editor.textContent || '';
    setIsEmpty(textContent.trim().length === 0);
    onChange(sanitized);
  }, [onChange]);

  const focusEditor = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!selection || selection.rangeCount > 0) return;
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const exec = useCallback(
    (command: string, value?: string) => {
      focusEditor();
      try {
        document.execCommand(command, false, value);
        updateCommandState();
        handleInput();
      } catch (error) {
        console.warn(`Command ${command} failed`, error);
      }
    },
    [focusEditor, handleInput, updateCommandState]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;
      const htmlData = clipboardData.getData('text/html');
      const textData = clipboardData.getData('text/plain');
      const payload = htmlData || textData;
      const sanitized = sanitizeRichText(payload);
      focusEditor();
      document.execCommand('insertHTML', false, sanitized);
      handleInput();
    },
    [focusEditor, handleInput]
  );

  const toolbarGroups = useMemo(
    () => [
      [
        {
          key: 'bold',
          icon: <Bold className="size-4" />,
          label: 'Bold',
          handler: () => exec('bold'),
          active: commandState.bold
        },
        {
          key: 'italic',
          icon: <Italic className="size-4" />,
          label: 'Italic',
          handler: () => exec('italic'),
          active: commandState.italic
        },
        {
          key: 'underline',
          icon: <Underline className="size-4" />,
          label: 'Underline',
          handler: () => exec('underline'),
          active: commandState.underline
        },
        {
          key: 'strike',
          icon: <Strikethrough className="size-4" />,
          label: 'Strikethrough',
          handler: () => exec('strikeThrough'),
          active: commandState.strikeThrough
        }
      ],
      [
        {
          key: 'ordered',
          icon: <ListOrdered className="size-4" />,
          label: 'Numbered list',
          handler: () => exec('insertOrderedList'),
          active: commandState.insertOrderedList
        },
        {
          key: 'unordered',
          icon: <List className="size-4" />,
          label: 'Bullet list',
          handler: () => exec('insertUnorderedList'),
          active: commandState.insertUnorderedList
        },
        {
          key: 'blockquote',
          icon: <Quote className="size-4" />,
          label: 'Block quote',
          handler: () => exec('formatBlock', 'blockquote')
        },
        {
          key: 'code',
          icon: <Code className="size-4" />,
          label: 'Code block',
          handler: () => exec('formatBlock', 'pre')
        }
      ],
      [
        {
          key: 'heading',
          icon: <Heading2 className="size-4" />,
          label: 'Heading',
          handler: () => exec('formatBlock', 'h2')
        },
        {
          key: 'link',
          icon: <Link2 className="size-4" />,
          label: 'Insert link',
          handler: () => {
            focusEditor();
            const url = window.prompt('Enter a URL');
            if (!url) {
              document.execCommand('unlink');
            } else {
              document.execCommand('createLink', false, url);
            }
            updateCommandState();
            handleInput();
          }
        },
        {
          key: 'divider',
          icon: <Minus className="size-4" />,
          label: 'Horizontal divider',
          handler: () => exec('insertHorizontalRule')
        }
      ],
      [
        {
          key: 'undo',
          icon: <Undo className="size-4" />,
          label: 'Undo',
          handler: () => exec('undo')
        },
        {
          key: 'redo',
          icon: <Redo className="size-4" />,
          label: 'Redo',
          handler: () => exec('redo')
        }
      ]
    ],
    [commandState, exec, focusEditor, handleInput, updateCommandState]
  );

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/40">
        {toolbarGroups.map((group, index) => (
          <div key={`group-${index}`} className="flex items-center gap-1">
            {group.map((item) => (
              <ToolbarButton
                key={item.key}
                icon={item.icon}
                label={item.label}
                onClick={item.handler}
                active={item.active}
              />
            ))}
            {index !== toolbarGroups.length - 1 ? (
              <Separator orientation="vertical" className="h-6 mx-1" />
            ) : null}
          </div>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        data-placeholder={placeholder}
        onInput={handleInput}
        onBlur={handleInput}
        onPaste={handlePaste}
        className={cn(
          'relative prose prose-sm dark:prose-invert min-h-[260px] px-4 py-3 focus:outline-none',
          'text-foreground [&_ol]:list-decimal [&_ul]:list-disc',
          isEmpty
            ? 'before:absolute before:top-3 before:left-4 before:text-muted-foreground before:content-[attr(data-placeholder)] before:pointer-events-none'
            : undefined
        )}
        suppressContentEditableWarning
      />
    </div>
  );
};
