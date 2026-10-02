import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from '../../utils/files.js';
import Button from '../ui/Button.jsx';

/** Button that opens the system file picker (on phones this also offers the camera). */
export default function FilePicker({
  onFiles,
  label = 'Add files',
  variant = 'secondary',
  size = 'sm',
  disabled,
}) {
  const input = useRef(null);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={Paperclip}
        onClick={() => input.current?.click()}
        disabled={disabled}
      >
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT_ATTRIBUTE}
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = ''; // allow choosing the same file again
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
