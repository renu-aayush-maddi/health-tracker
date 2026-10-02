import FormField from './FormField.jsx';

export default function TextField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  type = 'text',
  ...inputProps
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
      {(controlProps) => <input type={type} {...controlProps} {...inputProps} />}
    </FormField>
  );
}
