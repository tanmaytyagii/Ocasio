'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function AccountNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/auth/get-session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => { if (response.ok) { const data = await response.json(); setSignedIn(!!data?.user?.id); } })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <Link className="account-nav" href={signedIn ? '/account' : '/sign-in'}>{signedIn ? 'My account' : 'Sign in'} <span aria-hidden="true">↗</span></Link>;
}
