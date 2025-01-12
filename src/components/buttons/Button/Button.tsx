import { createLoadingCallback } from '../../../signals/createLoadingCallback.ts';
import { type ParentProps, Show } from 'solid-js';
import type { JSX } from 'solid-js/jsx-runtime';
import { Spinner } from '../../flow/Spinner/Spinner.tsx';
import cx from 'clsx';

export type ButtonProps = ParentProps<JSX.ButtonHTMLAttributes<HTMLButtonElement>>;

export const Button = (props: ButtonProps) => {
  const [isLoading, handleClick] = createLoadingCallback(props.onClick);

  return (
    <button
      type='button'
      {...props}
      class={cx(
        `
        min-h-8 
        text-slate-950
        border rounded-sm transition-all duration-100
        bg-amber-500 active:bg-amber-600 hover:bg-amber-400 
        border-amber-600 active:border-amber-700
        `,
        props.class,
      )}
      onClick={handleClick}
      disabled={isLoading() || props.disabled}
    >
      <Show when={!isLoading()} fallback={<Spinner />}>
        {props.children}
      </Show>
    </button>
  );
};
