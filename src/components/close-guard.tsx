"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Lets content inside a popup ask before it closes (e.g. while a booking is waiting for
 * payment). The popup provides the setter; content registers a message, or null.
 */
export const CloseGuardContext = createContext<((message: string | null) => void) | null>(null);

export function useCloseGuard(message: string | null) {
  const setGuard = useContext(CloseGuardContext);
  useEffect(() => {
    setGuard?.(message);
    return () => setGuard?.(null);
  }, [setGuard, message]);
}
