export const APP_ROLES = ["root", "coordinador", "supervisor", "empleado"] as const;
export type AppRole = (typeof APP_ROLES)[number] | "gerencia";

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const r = role.toLowerCase();
  if (["root", "coordinador", "supervisor", "empleado", "gerencia"].includes(r)) return r as AppRole;
  return null;
}

export function isAccessAdmin(role: AppRole | null | undefined) {
  return role === "root" || role === "coordinador";
}

export function canEditEmployeeProfile(role: AppRole | null | undefined) {
  return isAccessAdmin(role);
}

export function canManageAssignments(role: AppRole | null | undefined) {
  return role === "root" || role === "coordinador";
}

export function canSetRole(actorRole: AppRole | null | undefined, targetRole: AppRole | null | undefined, nextRole: AppRole) {
  if (actorRole === "root") return true;
  if (actorRole !== "coordinador") return false;
  if (targetRole === "root" || nextRole === "root") return false;
  return ["coordinador", "supervisor", "empleado"].includes(nextRole);
}

export function canResetPassword(actorRole: AppRole | null | undefined, targetRole: AppRole | null | undefined) {
  if (actorRole === "root") return true;
  if (actorRole !== "coordinador") return false;
  return targetRole !== "root";
}

export const ASSIGNMENT_ACTIVE_STATUSES = [
  "borrador",
  "evidencias_pendientes",
  "pendiente_supervisor",
  "pendiente_firma",
  "firmado",
  "dado_por_asignado",
] as const;

export function isAssignmentLocked(status: string | null | undefined, locked?: boolean | null) {
  return Boolean(locked) || status === "dado_por_asignado" || status === "cerrado";
}
