import { getSupabaseClient } from "./supabase";

let crashHandlerInstalled = false;
let previousErrorHandler: ((error: Error, isFatal?: boolean) => void) | undefined;
let unhandledRejectionInstalled = false;

export async function trackEvent(eventName: string, properties: Record<string, unknown> = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  try {
    const { error } = await (supabase.rpc as any)("track_client_event", {
      p_event_name: eventName,
      p_properties: properties
    });
    if (error && __DEV__) {
      console.warn("Analytics event was not recorded:", error.message);
    }
  } catch {
    // Avoid user-facing failures from analytics.
  }
}

export async function recordError(error: unknown, context: Record<string, unknown> = {}, isFatal = false) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;

  try {
    const { error: reportingError } = await (supabase.rpc as any)("record_client_error", {
      p_message: message,
      p_stack: stack,
      p_context: context,
      p_is_fatal: isFatal
    });
    if (reportingError && __DEV__) {
      console.warn("Client error report was not recorded:", reportingError.message);
    }
  } catch {
    // Avoid recursive failures from error reporting.
  }
}

export function installCrashReporting() {
  if (crashHandlerInstalled) {
    return;
  }
  crashHandlerInstalled = true;

  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) {
    return;
  }

  previousErrorHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    void recordError(error, { source: "global_error_handler" }, Boolean(isFatal));
    if (previousErrorHandler) {
      previousErrorHandler(error, isFatal);
    }
  });
}

export function installUnhandledRejectionReporting() {
  if (unhandledRejectionInstalled) {
    return;
  }
  unhandledRejectionInstalled = true;

  const globalScope = globalThis as any;
  if (typeof globalScope.addEventListener === "function") {
    globalScope.addEventListener("unhandledrejection", (event: any) => {
      void recordError(event?.reason ?? "Unhandled promise rejection", { source: "unhandledrejection" }, false);
    });
    return;
  }

  const processRef = globalScope.process;
  if (processRef && typeof processRef.on === "function") {
    processRef.on("unhandledRejection", (reason: unknown) => {
      void recordError(reason, { source: "process_unhandled_rejection" }, false);
    });
  }
}
