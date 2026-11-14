'use client';
import { useEffect, useRef, useState } from 'react';
import { createAuthClient } from '@neon/auth/next';
export const authClient = createAuthClient();

export default function AuthPanel({ close, signedIn }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function switchMode(value) { setMode(value); setError(''); }
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      let result;
      if (mode === 'verify') {
        result = await authClient.emailOtp.verifyEmail({ email, otp: code });
        if (!result.error) result = await authClient.signIn.email({ email, password });
      } else if (mode === 'signup') {
        result = await authClient.signUp.email({ email, password, name: email.split('@')[0] });
      } else {
        result = await authClient.signIn.email({ email, password });
      }
      if (result.error?.code === 'EMAIL_NOT_VERIFIED' || (mode === 'signup' && !result.error && !result.data?.token)) {
        const sent = await authClient.emailOtp.sendVerificationOtp({email, type:'email-verification'});
        if (sent.error) throw new Error(sent.error.message);
        switchMode('verify'); return;
      }
      if (result.error) throw new Error(result.error.message || 'Sign-in failed.');
      await signedIn();
    } catch (err) { setError(err.message || 'Could not reach the sign-in service. Try again.'); }
    finally { setBusy(false); }
  }
  const title = {signin:'Sign in', signup:'Create account', verify:'Verify your email'}[mode];
  return <dialog ref={dialog} onCancel={close} aria-labelledby="auth-title">
    <button className="close" aria-label="Close" onClick={close}>×</button>
    <h2 id="auth-title">{title}</h2><p>{mode === 'verify' ? 'Enter the code sent to ' + email : 'Keep your saved ports across visits.'}</p>
    <form onSubmit={submit}>
      {mode === 'verify' ? <label>Verification code<input required autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/></label> : <>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label>Password<input type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
      </>}
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy?'Please wait…':title}</button>
    </form>
    {mode !== 'verify' && <button className="link" onClick={()=>switchMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create an account':'Use an existing account'}</button>}
  </dialog>;
}
