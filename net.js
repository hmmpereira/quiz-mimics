// Ligação ao Firebase: entrada anónima e leitura/escrita em tempo real.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, update, get, remove, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

let db = null;
let desvio = 0;

// Devolve o identificador deste dispositivo. Mantém-se o mesmo ao recarregar a página.
export async function init() {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  const cred = await signInAnonymously(getAuth(app));
  onValue(ref(db, ".info/serverTimeOffset"), (s) => { desvio = s.val() || 0; });
  return cred.user.uid;
}

export function watch(caminho, cb) {
  return onValue(ref(db, caminho), (s) => cb(s.val()), (erro) => {
    console.warn("Sem permissão para ler", caminho, erro && erro.code);
    cb(null, erro);
  });
}

const limpo = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export function put(caminho, valor) { return set(ref(db, caminho), limpo(valor)); }
export function patch(caminho, obj) { return update(ref(db, caminho), limpo(obj)); }
export function del(caminho) { return remove(ref(db, caminho)); }
export async function read(caminho) { return (await get(ref(db, caminho))).val(); }

// Marca que o servidor troca pela sua própria hora ao gravar.
export function ts() { return serverTimestamp(); }

// Hora atual acertada pelo servidor, igual em todos os dispositivos.
export function now() { return Date.now() + desvio; }

export function onConn(cb) { return onValue(ref(db, ".info/connected"), (s) => cb(!!s.val())); }
