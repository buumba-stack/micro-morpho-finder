/**
 * Auth state for the AI features only.
 *
 * Deliberately lazy and failure-tolerant: if the account service is
 * unreachable, this hook reports `unavailable` and the rest of MicroFluor
 * (image analysis, editing, blanks, exports) keeps working offline.
 */
import { useCallback, useEffect, useState } from "react";

export interface AiAccount {
  userId: string;
  email: string | null;
  unlimited: boolean;
  creditsRemaining: number | null;
  creditsGranted: number | null;
}

export interface AuthState {
  loading: boolean;
  unavailable: boolean;
  account: AiAccount | null;
}

type SupabaseClient = Awaited<
  typeof import("@/integrations/supabase/client")
>["supabase"];

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getAuthClient(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = import("@/integrations/supabase/client")
      .then((m) => m.supabase)
      .catch((err) => {
        console.error("account service unavailable", err);
        return null;
      });
  }
  return clientPromise;
}

/** Bearer token for the AI endpoints, or null when signed out / unavailable. */
export async function getAccessToken(): Promise<string | null> {
  const client = await getAuthClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (err) {
    console.error("session lookup failed", err);
    return null;
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    unavailable: false,
    account: null,
  });

  const load = useCallback(async () => {
    const client = await getAuthClient();
    if (!client) {
      setState({ loading: false, unavailable: true, account: null });
      return null;
    }
    try {
      const { data } = await client.auth.getUser();
      const user = data.user;
      if (!user) {
        setState({ loading: false, unavailable: false, account: null });
        return null;
      }
      const [{ data: credits }, { data: roles }] = await Promise.all([
        client
          .from("ai_review_credits")
          .select("credits_remaining, credits_granted")
          .eq("user_id", user.id)
          .maybeSingle(),
        client.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const unlimited = (roles ?? []).some((r) => r.role === "owner" || r.role === "admin");
      const account: AiAccount = {
        userId: user.id,
        email: user.email ?? null,
        unlimited,
        creditsRemaining: credits?.credits_remaining ?? null,
        creditsGranted: credits?.credits_granted ?? null,
      };
      setState({ loading: false, unavailable: false, account });
      return account;
    } catch (err) {
      console.error("account lookup failed", err);
      setState({ loading: false, unavailable: true, account: null });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load();
    let unsub: (() => void) | undefined;
    void getAuthClient().then((client) => {
      if (!client || !active) return;
      const { data } = client.auth.onAuthStateChange(() => {
        void load();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsub?.();
    };
  }, [load]);

  const signOut = useCallback(async () => {
    const client = await getAuthClient();
    await client?.auth.signOut();
    await load();
  }, [load]);

  return { ...state, refresh: load, signOut };
}
