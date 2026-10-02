import { useState } from 'react';
import { CircleAlert, FileText, Image as ImageIcon, Tag, X } from 'lucide-react';
import { ATTACHMENT_LIMITS } from '@health-tracker/shared';
import { useTagSuggestions } from '../../hooks/useHealthEvents.js';
import { checkFile, formatBytes, isImage, MAX_FILE_MB } from '../../utils/files.js';
import Button from '../ui/Button.jsx';
import TagInput, { TagList } from '../ui/TagInput.jsx';
import FilePicker from './FilePicker.jsx';
import styles from './Attachments.module.css';

const entryKey = ({ file }) => `${file.name}-${file.size}-${file.lastModified}`;

/**
 * Files chosen in the add/edit form, each with optional tags. `files` is a list of
 * { file, tags } entries; they upload right after the event is saved.
 */
export default function PendingFiles({ files, onChange, existingCount = 0 }) {
  const [problems, setProblems] = useState([]);
  const [editing, setEditing] = useState(null);
  const { suggestions } = useTagSuggestions();
  const room = ATTACHMENT_LIMITS.maxPerEvent - existingCount - files.length;

  const add = (picked) => {
    const errors = [];
    const accepted = [];
    for (const file of picked) {
      const problem = checkFile(file);
      if (problem) errors.push(problem);
      else if (accepted.length >= room) {
        errors.push(
          `${file.name}: an event can have at most ${ATTACHMENT_LIMITS.maxPerEvent} files.`,
        );
      } else accepted.push({ file, tags: [] });
    }
    setProblems(errors);
    if (accepted.length) onChange([...files, ...accepted]);
  };

  const setTags = (index, tags) =>
    onChange(files.map((entry, i) => (i === index ? { ...entry, tags } : entry)));

  return (
    <>
      <p className={styles.muted}>
        Optional: photos of prescriptions, lab reports or scans. JPG, PNG, WebP, HEIC or PDF, up to{' '}
        {MAX_FILE_MB} MB each. Add tags to find them easily later. Files upload after you save.
        {existingCount > 0 &&
          ` ${existingCount} file${existingCount === 1 ? ' is' : 's are'} already attached; manage them on the event page.`}
      </p>
      {problems.map((problem) => (
        <p key={problem} className={styles.error} role="alert">
          <CircleAlert size={14} aria-hidden="true" className={styles.inlineIcon} /> {problem}
        </p>
      ))}
      {files.length > 0 && (
        <ul className={styles.pendingList} aria-label="Files to upload">
          {files.map((entry, index) => {
            const Icon = isImage(entry.file.type) ? ImageIcon : FileText;
            const key = entryKey(entry);
            const isEditing = editing === key;
            return (
              <li key={key} className={styles.pendingItem}>
                <div className={styles.pendingRow}>
                  <Icon size={18} aria-hidden="true" className={styles.pendingIcon} />
                  <div className={styles.body}>
                    <p className={styles.nameText} title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <p className={styles.meta}>{formatBytes(entry.file.size)}</p>
                    <TagList tags={entry.tags} className={styles.tags} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Tag}
                    iconOnly
                    aria-expanded={isEditing}
                    onClick={() => setEditing(isEditing ? null : key)}
                  >
                    {`${isEditing ? 'Done tagging' : 'Add tags to'} ${entry.file.name}`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={X}
                    iconOnly
                    onClick={() => onChange(files.filter((_, i) => i !== index))}
                  >
                    {`Remove ${entry.file.name}`}
                  </Button>
                </div>
                {isEditing && (
                  <div className={styles.tagEditor}>
                    <TagInput
                      label={`Tags for ${entry.file.name}`}
                      tags={entry.tags}
                      onChange={(tags) => setTags(index, tags)}
                      suggestions={suggestions}
                      autoFocus
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {room > 0 && (
        <div>
          <FilePicker onFiles={add} label={files.length ? 'Add more files' : 'Add files'} />
        </div>
      )}
    </>
  );
}
