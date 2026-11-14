interface Props {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

/** Full-page error: never a blank screen (§9, criterion 13). */
export function ErrorScreen({ title, message, action }: Props) {
  return (
    <main className="error-screen">
      <div role="alert">
        <h1>{title}</h1>
        <p>{message}</p>
        {action && (
          <button type="button" className="button button--primary" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </main>
  );
}
