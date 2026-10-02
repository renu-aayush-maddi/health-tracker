import { useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { useAttachmentMutations, useTagSuggestions } from '../../hooks/useHealthEvents.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import TagInput from '../ui/TagInput.jsx';

function TagsForm({ eventId, attachment, onDone, formId }) {
  const [tags, setTags] = useState(attachment.tags);
  const [error, setError] = useState(null);
  const { updateTags } = useAttachmentMutations(eventId);
  const { suggestions } = useTagSuggestions();
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    try {
      await updateTags.mutateAsync({ attachmentId: attachment.id, tags });
      toast.success('Tags saved.');
      onDone();
    } catch (err) {
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      <TagInput tags={tags} onChange={setTags} suggestions={suggestions} autoFocus />
    </form>
  );
}

export default function EditTagsDialog({ eventId, attachment, onClose }) {
  const { updateTags } = useAttachmentMutations(eventId);
  const formId = 'edit-tags-form';
  return (
    <Dialog
      open={Boolean(attachment)}
      onClose={onClose}
      busy={updateTags.isPending}
      title="Edit tags"
      description={attachment ? attachment.filename : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updateTags.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={updateTags.isPending}>
            Save tags
          </Button>
        </>
      }
    >
      {attachment && (
        <TagsForm eventId={eventId} attachment={attachment} onDone={onClose} formId={formId} />
      )}
    </Dialog>
  );
}
