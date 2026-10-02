import FormField from './FormField.jsx';
import styles from './Field.module.css';

/** `options`: array of { value, label }. */
export default function SelectField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  options,
  ...selectProps
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
      {(controlProps) => (
        <select
          {...controlProps}
          className={`${controlProps.className} ${styles.select}`}
          {...selectProps}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
