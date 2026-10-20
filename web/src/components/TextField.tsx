import { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
  multiline?: boolean;
  help?: string;
}

export function TextField({ label, value, onChange, maxLength, required = false, multiline = false, help }: Props) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const common = {
    id,
    value,
    required,
    maxLength,
    'aria-describedby': helpId,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="tag">必須</span>}
      </label>
      {multiline ? <textarea className="input textarea" rows={4} {...common} /> : <input className="input" type="text" {...common} />}
      {help && (
        <span className="help" id={helpId}>
          {help}
        </span>
      )}
    </div>
  );
}
