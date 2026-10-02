import FormField from './FormField.jsx';

export default function TextareaField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  rows = 3,
  ...textareaProps
}) {
  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={className}
    >
      {(controlProps) => <textarea rows={rows} {...controlProps} {...textareaProps} />}
    </FormField>
  );
}
