export default function Home() {
  return (
    <main className="auth-page">
      <div className="auth-box">

        <div className="auth-header">
          <div className="auth-icon">
            <i className="fa-solid fa-shield-halved icon-white" style={{ fontSize: '1.6rem' }}></i>
          </div>
          <h1>Sentry</h1>
          <p>Secure user management and audit tracking platform</p>
        </div>

        <div className="card" style={{ padding: '2rem' }}>
          <div className="form-title">
            <i className="fa-solid fa-right-to-bracket icon-cyan icon-md"></i>
            Sign in to your account
          </div>

          <div className="form-group">
            <div className="field">
              <label>
                <i className="fa-solid fa-user icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
                Username
              </label>
              <input placeholder="Enter your username" autoComplete="off" />
            </div>
            <div className="field">
              <label>
                <i className="fa-solid fa-lock icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
                Password
              </label>
              <input placeholder="Enter your password" type="password" autoComplete="new-password" />
            </div>
            <button style={{ marginTop: '0.5rem' }}>
              <i className="fa-solid fa-arrow-right-to-bracket" style={{ marginRight: '0.5rem' }}></i>
              Sign in
            </button>
          </div>
        </div>

        <p className="auth-footer">
          <i className="fa-solid fa-lock icon-slate icon-sm" style={{ marginRight: '0.4rem' }}></i>
          Protected by enterprise-grade security
        </p>

      </div>
    </main>
  );
}