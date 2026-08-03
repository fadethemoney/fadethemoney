"use client";

import { useState, useTransition } from "react";
import { setComp } from "./actions";

/** Comp toggle for one member row. Super-admin only — enforced in the action. */
export function MemberRow({ userId, isComp }: { userId: string; isComp: boolean }) {
  const [comp, setLocalComp] = useState(isComp);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(undefined);
    startTransition(async () => {
      const res = await setComp(userId, !comp);
      if (res.ok) setLocalComp(!comp);
      else setError(res.error);
    });
  }

  return (
    <>
      <button className="ul-sm-btn" onClick={toggle} disabled={pending}>
        {comp ? "Remove free access" : "Give free access"}
      </button>
      {error ? <span className="ul-note warn">{error}</span> : null}
    </>
  );
}
