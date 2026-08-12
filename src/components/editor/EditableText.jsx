import { useState, useRef, useEffect } from 'react';
import { Edit2, Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export default function EditableText({
  value,
  onChange,
  className,
  as = 'span',
  multiline = false,
  placeholder = 'Click to edit text...',
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setText(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (onChange && text !== value) {
      onChange(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave();
    } else if (e.key === 'Escape') {
      setText(value || '');
      setIsEditing(false);
    }
  };

  const Component = as;

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1.5 relative z-20">
        {multiline ? (
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full bg-neutral-900 border-2 border-amber-500 rounded-lg p-2 text-white font-sans focus:outline-none shadow-lg',
              className
            )}
            rows={3}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'bg-neutral-900 border-2 border-amber-500 rounded-lg px-2 py-1 text-white font-sans focus:outline-none shadow-lg',
              className
            )}
          />
        )}
        <button
          onClick={handleSave}
          className="p-1 rounded-md bg-amber-500 text-neutral-950 hover:bg-amber-400 transition-all shadow-xs cursor-pointer"
          title="Save text"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <Component
      onClick={() => setIsEditing(true)}
      className={cn(
        'group relative inline-block cursor-pointer border border-transparent hover:border-dashed hover:border-amber-400/80 hover:bg-amber-500/10 rounded px-1 transition-all',
        className
      )}
      title="Click to edit text (WordPress WYSIWYG mode)"
    >
      {text || <span className="italic opacity-50">{placeholder}</span>}
      <span className="inline-ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400 text-xs">
        ✏️
      </span>
    </Component>
  );
}
