import type {ReactNode} from 'react';

export default function TabHeader({id, eyebrow, title, children}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return <header className="tab-header">
    <p className="tab-header-eyebrow">{eyebrow}</p>
    <h1 id={id}>{title}</h1>
    <p className="tab-header-subtitle">{children}</p>
  </header>;
}
