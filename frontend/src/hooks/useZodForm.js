import { useCallback, useMemo, useState } from 'react';
import { toFieldErrors } from '@health-tracker/shared';
import { ApiError } from '../services/apiClient.js';
import { getIn, setIn } from '../utils/objectPath.js';

/**
 * Form state validated by the same Zod schema the API uses.
 * - Errors appear once a field is blurred, or for every field after a submit attempt.
 * - Server field errors (e.g. "email already exists") show until that field changes.
 * - On a failed submit, focus moves to the first invalid field in DOM order.
 */
export function useZodForm({ schema, initialValues }) {
  const [baseline, setBaseline] = useState(initialValues);
  const [values, setValuesState] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const clientErrors = useMemo(() => {
    const result = schema.safeParse(values);
    return result.success ? {} : toFieldErrors(result.error);
  }, [schema, values]);

  const errorFor = useCallback(
    (path) =>
      serverErrors[path] ?? (submitAttempted || touched[path] ? clientErrors[path] : undefined),
    [serverErrors, submitAttempted, touched, clientErrors],
  );

  const setField = useCallback((path, value) => {
    setValuesState((prev) => setIn(prev, path, value));
    setServerErrors((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  /** For structural changes (adding/removing list items). Clears server errors. */
  const setValues = useCallback((updater) => {
    setValuesState(updater);
    setServerErrors({});
  }, []);

  const touch = useCallback(
    (path) => setTouched((prev) => (prev[path] ? prev : { ...prev, [path]: true })),
    [],
  );

  const field = (path) => ({
    name: path,
    value: getIn(values, path) ?? '',
    onChange: (event) => setField(path, event.target.value),
    onBlur: () => touch(path),
    error: errorFor(path),
  });

  const focusFirstError = (formElement, errors) => {
    requestAnimationFrame(() => {
      const elements = formElement?.querySelectorAll('[name]') ?? [];
      const target = [...elements].find((el) => el.name in errors);
      target?.focus();
    });
  };

  const handleSubmit = (onValid) => async (event) => {
    event?.preventDefault();
    // Captured now: React clears currentTarget once the event handler yields.
    const formElement = event?.currentTarget;
    setSubmitAttempted(true);
    setFormError(null);

    const result = schema.safeParse(values);
    if (!result.success) {
      focusFirstError(formElement, toFieldErrors(result.error));
      return;
    }

    setSubmitting(true);
    try {
      await onValid(result.data);
      setBaseline(values);
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) {
        setServerErrors(err.fields);
        if (err.fields._form) setFormError(err.fields._form);
        focusFirstError(formElement, err.fields);
      } else {
        setFormError(err?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = useCallback((nextValues) => {
    setBaseline(nextValues);
    setValuesState(nextValues);
    setTouched({});
    setServerErrors({});
    setSubmitAttempted(false);
    setFormError(null);
  }, []);

  return {
    values,
    field,
    setField,
    setValues,
    touch,
    errorFor,
    handleSubmit,
    submitting,
    formError,
    setFormError,
    isDirty: values !== baseline,
    reset,
  };
}
