import { Link } from 'react-router';
import styles from './Button.module.css';
import Spinner from './Spinner.jsx';

/**
 * Variants: primary | secondary | ghost | danger. Sizes: md | sm.
 * Pass `to` to render a router link styled as a button, or `href` for a plain link (e.g. a file).
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon: Icon,
  iconOnly = false,
  to,
  href,
  type = 'button',
  className = '',
  children,
  disabled,
  ...rest
}) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    iconOnly && styles.iconOnly,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? (
        <Spinner size={16} />
      ) : (
        Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden="true" />
      )}
      {iconOnly ? <span className="visually-hidden">{children}</span> : children}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
