import { WartaqLogo } from './brand/components'

export function WorkspaceLoading({ message }: { message: string }) {
  return (
    <div className="workspace-loading" aria-busy="true">
      <aside aria-hidden="true">
        <div className="loading-brand">
          <WartaqLogo />
        </div>
        <div />
        <div />
        <div />
        <div />
      </aside>
      <main id="main-content" tabIndex={-1}>
        <div className="loading-mobile-brand" aria-hidden="true">
          <WartaqLogo />
        </div>
        <p role="status">{message}</p>
        <div className="loading-line" aria-hidden="true" />
        <div className="loading-cards" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
        <div className="loading-panel" aria-hidden="true" />
        <div className="loading-mobile-nav" aria-hidden="true" />
      </main>
    </div>
  )
}
