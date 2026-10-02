import { useNavigate } from 'react-router';

/** Goes back within the app if possible; otherwise (e.g. opened from a bookmark) to `fallback`. */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
