import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'default' | 'primary' | 'brand' | 'ghost' | 'danger' | 'danger-soft';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  /** Icon-only button: `children` becomes the accessible label. */
  iconOnly?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

function classes({ variant = 'default', size = 'md', block, iconOnly }: CommonProps, extra?: string) {
  return [
    'btn',
    variant !== 'default' && `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    iconOnly && 'btn--icon',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function Content({ icon, iconRight, iconOnly, loading, children }: CommonProps) {
  if (iconOnly) {
    return (
      <>
        {loading ? <span className="spinner" aria-hidden /> : icon && <Icon name={icon} />}
        <span className="visually-hidden">{children}</span>
      </>
    );
  }
  return (
    <>
      {loading ? <span className="spinner" aria-hidden /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </>
  );
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { variant, size, icon, iconRight, block, iconOnly, loading, children, className, type, disabled, ...rest } = props;
  const common = { variant, size, icon, iconRight, block, iconOnly, loading, children };
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes(common, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={iconOnly && typeof children === 'string' ? children : rest.title}
      {...rest}
    >
      <Content {...common} />
    </button>
  );
});

export function ButtonLink(props: CommonProps & LinkProps) {
  const { variant, size, icon, iconRight, block, iconOnly, loading, children, className, ...rest } = props;
  const common = { variant, size, icon, iconRight, block, iconOnly, loading, children };
  return (
    <Link className={classes(common, className)} {...rest}>
      <Content {...common} />
    </Link>
  );
}
