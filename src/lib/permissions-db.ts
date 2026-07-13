import { APP_ROLES, type AppRole } from "@/lib/role-access";
import {
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_PERMISSION_ROWS,
  PERMISSION_MODULES,
  normalizePermissionRows,
  sortPermissionRows,
  storageRoleForAppRole,
  type PermissionRow,
} from "@/lib/permissions-model";

type PermissionStorageRow = {
  role: string;
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

const VALID_MODULES = new Set<string>(PERMISSION_MODULES);

function toStorageRow(row: PermissionRow, availableRoles: string[]) {
  return {
    role: storageRoleForAppRole(row.role, availableRoles),
    modulo: row.modulo,
    pode_ver: row.pode_ver,
    pode_criar: row.pode_criar,
    pode_editar: row.pode_editar,
    pode_excluir: row.pode_excluir,
  };
}

function isCanonicalStorage(availableRoles: string[]) {
  return APP_ROLES.some((role) => availableRoles.includes(role));
}

function hasInvalidModules(rows: PermissionStorageRow[]) {
  return rows.some((row) => !VALID_MODULES.has(row.modulo));
}

export async function loadPermissionRows(admin: any): Promise<PermissionStorageRow[]> {
  const { data, error } = await admin
    .from("permissoes_papel")
    .select("role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir")
    .order("modulo");
  if (error) throw new Error(error.message);
  return (data ?? []) as PermissionStorageRow[];
}

export async function ensurePermissionMatrix(admin: any): Promise<PermissionStorageRow[]> {
  const rows = await loadPermissionRows(admin);
  const availableRoles = Array.from(new Set(rows.map((row) => row.role)));

  if (availableRoles.length === 0) {
    const payload = DEFAULT_PERMISSION_MATRIX.map((row) => toStorageRow(row, APP_ROLES as unknown as string[]));
    const { error } = await admin
      .from("permissoes_papel")
      .upsert(payload, { onConflict: "role,modulo" });
    if (error) throw new Error(error.message);
    return loadPermissionRows(admin);
  }

  const invalidRows = rows.filter((row) => !VALID_MODULES.has(row.modulo));
  if (invalidRows.length === 0) return rows;

  const payload = DEFAULT_PERMISSION_MATRIX.map((row) => toStorageRow(row, availableRoles));
  const { error: upsertError } = await admin
    .from("permissoes_papel")
    .upsert(payload, { onConflict: "role,modulo" });
  if (upsertError) throw new Error(upsertError.message);

  for (const row of invalidRows) {
    const { error } = await admin
      .from("permissoes_papel")
      .delete()
      .eq("role", row.role)
      .eq("modulo", row.modulo);
    if (error) throw new Error(error.message);
  }

  return loadPermissionRows(admin);
}

export function normalizeStoredPermissions(rows: PermissionStorageRow[]): PermissionRow[] {
  const normalized = normalizePermissionRows(rows as unknown as Array<Record<string, unknown>>);
  const availableRoles = Array.from(new Set(rows.map((row) => row.role)));
  if (isCanonicalStorage(availableRoles)) return sortPermissionRows(normalized);

  if (hasInvalidModules(rows)) return sortPermissionRows(DEFAULT_PERMISSION_MATRIX);

  const byKey = new Map(normalized.map((row) => [`${row.role}::${row.modulo}`, row]));
  const merged = DEFAULT_PERMISSION_MATRIX.map((row) => byKey.get(`${row.role}::${row.modulo}`) ?? row);
  return sortPermissionRows(merged);
}

export function permissionsForRole(rows: PermissionStorageRow[], role: AppRole): PermissionRow[] {
  return normalizeStoredPermissions(rows).filter((row) => row.role === role);
}