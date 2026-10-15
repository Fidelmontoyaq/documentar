import { create } from 'zustand';
import type {
  ActaElectoral, CambioAuditoria, CampoNumerico, CampoTexto, CeldaVoto, Columnas, Eleccion,
  MiembroMesa, PaginaActa, Seleccion, VotoOrganizacion,
} from '../types/acta';
import { validarActa } from '../hooks/useValidacionActa';
import { registrarAuditoria } from '../hooks/useAuditoria';
import { celdaNueva } from '../utils/celdas';

// Tras cada mutación se recalcula estado y observaciones (fuente única de verdad).
const recalcular = (a: ActaElectoral): ActaElectoral => {
  const r = validarActa(a);
  return { ...a, estado_acta: r.estado, observaciones: [...r.errores, ...r.avisos] };
};

interface Estado {
  usuario: string;
  archivo: { nombre: string; hash: string } | null;
  paginas: PaginaActa[];
  paginaActual: number;
  acta: ActaElectoral | null;
  seleccion: Seleccion | null;
  columnasGuia: Columnas | null; // bandas de calibración dibujadas sobre el visor
  procesando: boolean;
  progreso: number;
  mensaje: string;
  auditoriaVersion: number;

  setUsuario: (u: string) => void;
  setProcesando: (p: boolean, progreso?: number, mensaje?: string) => void;
  setArchivo: (a: { nombre: string; hash: string }, paginas: PaginaActa[]) => void;
  setPaginaActual: (i: number) => void;
  setActa: (a: ActaElectoral) => void;
  setColumnasGuia: (c: Columnas | null) => void;
  seleccionar: (s: Seleccion | null) => void;
  setCampoNumerico: (campo: CampoNumerico, valor: number) => void;
  setCampoTexto: (campo: CampoTexto, valor: string) => void;
  setMiembro: (rol: MiembroMesa['rol'], patch: Partial<MiembroMesa>) => void;
  actualizarOrg: (id: string, patch: Partial<Pick<VotoOrganizacion, 'codigo' | 'nombre_partido'>>) => void;
  actualizarCelda: (id: string, e: Eleccion, patch: Partial<CeldaVoto>) => void;
  confirmarCelda: (id: string, e: Eleccion) => void;
  aplicarLectura: (
    orgs: VotoOrganizacion[], columnas: Columnas,
    campos: Partial<Record<CampoNumerico, { valor: number; conf: number }>>, confiables?: boolean,
  ) => void;
  agregarOrg: () => void;
  eliminarOrg: (id: string) => void;
}

export const useActaStore = create<Estado>()((set, get) => {
  const log = (accion: string, cambios: CambioAuditoria[]) => {
    const { usuario, archivo } = get();
    void registrarAuditoria({
      timestamp: new Date().toISOString(), usuario, accion, hash_acta: archivo?.hash ?? null, cambios,
    }).then(() => set((s) => ({ auditoriaVersion: s.auditoriaVersion + 1 })));
  };
  const mutarActa = (fn: (a: ActaElectoral) => ActaElectoral) => {
    const a = get().acta;
    if (a) set({ acta: recalcular(fn(a)) });
  };

  return {
    usuario: 'fiscalizador', archivo: null, paginas: [], paginaActual: 0, acta: null,
    seleccion: null, columnasGuia: null, procesando: false, progreso: 0, mensaje: '', auditoriaVersion: 0,

    setUsuario: (usuario) => set({ usuario }),
    setProcesando: (procesando, progreso = 0, mensaje = '') => set({ procesando, progreso, mensaje }),

    setArchivo: (archivo, paginas) => {
      get().paginas.forEach((p) => URL.revokeObjectURL(p.url));
      set({ archivo, paginas, paginaActual: 0, acta: null, seleccion: null, columnasGuia: null });
      log('ACTA_CARGADA', [{ campo: 'archivo', antes: null, despues: `${archivo.nombre} · SHA-256 ${archivo.hash}` }]);
    },

    setPaginaActual: (paginaActual) => set({ paginaActual }),

    setActa: (acta) => {
      set({ acta: recalcular(acta), seleccion: null, columnasGuia: acta.columnas });
      log('OCR_EJECUTADO', [
        { campo: 'filas_detectadas', antes: null, despues: acta.organizaciones.length },
        { campo: 'mesa', antes: null, despues: acta.mesa },
      ]);
    },

    setColumnasGuia: (columnasGuia) => set({ columnasGuia }),
    seleccionar: (seleccion) => set({ seleccion }),

    setCampoNumerico: (campo, valor) => {
      const antes = get().acta?.[campo];
      if (antes === valor) return;
      mutarActa((a) => ({ ...a, [campo]: valor, confianza_campos: { ...a.confianza_campos, [campo]: 1 } }));
      log('EDICION_CAMPO', [{ campo, antes, despues: valor }]);
    },

    setCampoTexto: (campo, valor) => {
      const antes = get().acta?.[campo];
      if (antes === valor) return;
      mutarActa((a) => ({ ...a, [campo]: valor }));
      log('EDICION_CAMPO', [{ campo, antes, despues: valor }]);
    },

    setMiembro: (rol, patch) => {
      const previo = get().acta?.miembros_mesa.find((m) => m.rol === rol);
      if (!previo) return;
      const cambios: CambioAuditoria[] = (Object.keys(patch) as (keyof MiembroMesa)[])
        .filter((k) => previo[k] !== patch[k])
        .map((k) => ({ campo: `${rol}.${k}`, antes: previo[k], despues: patch[k] }));
      if (!cambios.length) return;
      mutarActa((a) => ({ ...a, miembros_mesa: a.miembros_mesa.map((m) => (m.rol === rol ? { ...m, ...patch } : m)) }));
      log('EDICION_MIEMBRO', cambios);
    },

    actualizarOrg: (id, patch) => {
      const previo = get().acta?.organizaciones.find((o) => o.id === id);
      if (!previo) return;
      const cambios: CambioAuditoria[] = (Object.keys(patch) as ('codigo' | 'nombre_partido')[])
        .filter((k) => previo[k] !== patch[k])
        .map((k) => ({ campo: `org[${previo.codigo || previo.id.slice(0, 4)}].${k}`, antes: previo[k], despues: patch[k] }));
      if (!cambios.length) return;
      mutarActa((a) => ({ ...a, organizaciones: a.organizaciones.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
      log('EDICION_ORGANIZACION', cambios);
    },

    actualizarCelda: (id, e, patch) => {
      const org = get().acta?.organizaciones.find((o) => o.id === id);
      if (!org) return;
      const previo = org[e];
      // Tocar estado o valor implica que una persona lo revisó.
      const efectivo: Partial<CeldaVoto> = { ...patch };
      if (!('verificada' in patch) && ('valor' in patch || 'estado' in patch)) efectivo.verificada = true;
      const cambios: CambioAuditoria[] = (Object.keys(efectivo) as (keyof CeldaVoto)[])
        .filter((k) => previo[k] !== efectivo[k])
        .map((k) => ({ campo: `org[${org.codigo}].${e}.${k}`, antes: previo[k], despues: efectivo[k] }));
      if (!cambios.length) return;
      mutarActa((a) => ({
        ...a,
        organizaciones: a.organizaciones.map((o) => (o.id === id ? { ...o, [e]: { ...o[e], ...efectivo } } : o)),
      }));
      log('EDICION_CELDA', cambios);
    },

    confirmarCelda: (id, e) => get().actualizarCelda(id, e, { verificada: true }),

    aplicarLectura: (organizaciones, columnas, campos, confiables) => {
      const antes = get().acta;
      if (!antes) return;
      mutarActa((a) => {
        const patch: Partial<ActaElectoral> = {};
        const cc = { ...a.confianza_campos };
        for (const k of Object.keys(campos) as CampoNumerico[]) {
          (patch as Record<string, number>)[k] = campos[k]!.valor;
          cc[k] = campos[k]!.conf;
        }
        return {
          ...a, ...patch, organizaciones, columnas, confianza_campos: cc,
          columnas_confiables: confiables ?? a.columnas_confiables,
        };
      });
      set({ columnasGuia: columnas });
      log('CELDAS_LEIDAS', [{ campo: 'celdas', antes: null, despues: `${organizaciones.length} filas × 2 elecciones` }]);
    },

    agregarOrg: () => {
      const nueva: VotoOrganizacion = {
        id: crypto.randomUUID(), codigo: '', nombre_partido: '',
        provincial: { ...celdaNueva(), confianza: 1, verificada: true },
        distrital: { ...celdaNueva(), confianza: 1, verificada: true },
      };
      mutarActa((a) => ({ ...a, organizaciones: [...a.organizaciones, nueva] }));
      log('FILA_AGREGADA', [{ campo: 'organizaciones', antes: null, despues: nueva.id }]);
    },

    eliminarOrg: (id) => {
      const o = get().acta?.organizaciones.find((x) => x.id === id);
      if (!o) return;
      mutarActa((a) => ({ ...a, organizaciones: a.organizaciones.filter((x) => x.id !== id) }));
      set((s) => (s.seleccion?.id === id ? { seleccion: null } : {}));
      log('FILA_ELIMINADA', [{
        campo: `org[${o.codigo}]`,
        antes: `${o.nombre_partido}: prov ${o.provincial.valor} / dist ${o.distrital.valor}`, despues: null,
      }]);
    },
  };
});
