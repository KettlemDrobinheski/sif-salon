import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);

// Executa os módulos reais com um Firestore em memória; nenhum dado remoto é escrito.
function load(relative, mocks = {}) {
  const filename = path.resolve(import.meta.dirname, "..", relative);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith(".css")) return { default: {} };
    if (name.startsWith("@/")) {
      const base = name.slice(2);
      const extension = existsSync(path.resolve(import.meta.dirname, "..", `${base}.ts`)) ? ".ts" : ".tsx";
      return load(`${base}${extension}`, mocks);
    }
    if (name.startsWith(".")) return load(path.relative(path.resolve(import.meta.dirname, ".."), path.resolve(path.dirname(filename), `${name}.tsx`)), mocks);
    return nodeRequire(name);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const { formatarOS, proximaOS } = load("lib/ordem-servico.ts");

function database() {
  const records = new Map([
    ["funcionarios/a", { nome: "A", ativo: true, percentualComissao: 40 }],
    ["servicos/s", { nome: "Corte", ativo: true, valor: 50, percentualComissao: 40 }],
  ]);
  let version = 0;
  let id = 0;
  let rejectCommit = false;
  let retries = 0;
  const snapshot = (ref) => {
    const value = records.get(ref.path);
    return { exists: () => value !== undefined, data: () => value && { ...value } };
  };
  const sdk = {
    collection: (_, name) => ({ path: name }),
    doc: (parent, ...parts) => {
      const location = parent.path ? `${parent.path}/id-${++id}` : parts.join("/");
      return { path: location, id: location.split("/").at(-1) };
    },
    getDoc: async (ref) => snapshot(ref),
    serverTimestamp: () => "test-timestamp",
    deleteDoc: async (ref) => { records.delete(ref.path); },
    runTransaction: async (_, callback) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const readVersion = version;
        const writes = [];
        const result = await callback({
          get: async (ref) => snapshot(ref),
          set: (ref, value) => writes.push([ref.path, value]),
          update: (ref, value) => writes.push([ref.path, { ...records.get(ref.path), ...value }]),
        });
        if (readVersion !== version) { retries++; continue; }
        if (rejectCommit) throw new Error("Simulated failed commit");
        for (const [key, value] of writes) records.set(key, value);
        version++;
        return result;
      }
      throw new Error("Retry limit");
    },
  };
  const client = load("lib/firestore-client.ts", {
    "firebase/firestore": sdk,
    "@/lib/firebase": { db: {} },
  });
  return { records, client, fail: () => { rejectCommit = true; }, retries: () => retries };
}

const input = { funcionarioId: "a", servicoIds: ["s"], clienteNome: "Cliente teste" };

test("formatação: mínimo de quatro dígitos, sem truncar após 9999", () => {
  for (const [number, expected] of [[1, "0001"], [2, "0002"], [9, "0009"], [99, "0099"], [999, "0999"], [1000, "1000"], [9999, "9999"], [10000, "10000"]]) {
    assert.equal(formatarOS(number), expected);
  }
  assert.equal(formatarOS(undefined), "Sem OS");
  for (const invalid of [-1, 0, 1.5, NaN]) assert.equal(formatarOS(invalid), "OS inválida");
});

test("primeiro e segundo registros persistem 0001 e 0002, mantendo a comissão", async () => {
  const { client, records } = database();
  const first = (await client.registrarAtendimento(input)).id;
  const second = (await client.registrarAtendimento(input)).id;
  assert.equal(formatarOS(records.get(`atendimentos/${first}`).os), "0001");
  assert.equal(formatarOS(records.get(`atendimentos/${second}`).os), "0002");
  assert.equal(records.get(`atendimentos/${first}`).comissao, 20);
  assert.equal(records.get("contadores/atendimentos").ultimaOS, 2);
});

test("concorrência: repetições da transação não duplicam OS", async () => {
  const db = database();
  const ids = await Promise.all(Array.from({ length: 20 }, () => db.client.registrarAtendimento(input).then((result) => result.id)));
  const numbers = ids.map((id) => db.records.get(`atendimentos/${id}`).os).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.ok(db.retries() > 0);
  assert.equal(db.records.get("contadores/atendimentos").ultimaOS, 20);
});

test("excluir todos os atendimentos não reinicia nem reutiliza OS", async () => {
  const { client, records } = database();
  const first = (await client.registrarAtendimento(input)).id;
  const second = (await client.registrarAtendimento(input)).id;
  await client.removerDocumento("atendimentos", first);
  await client.removerDocumento("atendimentos", second);
  const third = (await client.registrarAtendimento(input)).id;
  assert.equal(records.get(`atendimentos/${third}`).os, 3);
});

test("retoma contador persistido e ultrapassa 9999", async () => {
  const { client, records } = database();
  records.set("contadores/atendimentos", { ultimaOS: 9999 });
  const id = (await client.registrarAtendimento(input)).id;
  assert.equal(formatarOS(records.get(`atendimentos/${id}`).os), "10000");
});

test("falha no commit não grava atendimento nem incrementa contador", async () => {
  const db = database();
  db.records.set("contadores/atendimentos", { ultimaOS: 12 });
  db.fail();
  await assert.rejects(db.client.registrarAtendimento(input), /failed commit/);
  assert.equal(db.records.get("contadores/atendimentos").ultimaOS, 12);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith("atendimentos/")).length, 0);
});

test("registros antigos não são sobrescritos", async () => {
  const { client, records } = database();
  const legacy = { valor: 30, comissao: 12, data: "2026-01-01" };
  records.set("atendimentos/antigo", { ...legacy });
  await client.registrarAtendimento(input);
  assert.deepEqual(records.get("atendimentos/antigo"), legacy);
});

test("contador inválido ou esgotado falha sem reiniciar", async () => {
  for (const invalid of [undefined, null, "9", -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => proximaOS(invalid));
  }
  const { client, records } = database();
  records.set("contadores/atendimentos", {});
  await assert.rejects(client.registrarAtendimento(input), /Contador de OS/);
  assert.deepEqual(records.get("contadores/atendimentos"), {});
});

test("helpers genéricos não permitem criar atendimento sem OS nem editar OS", async () => {
  const { client } = database();
  await assert.rejects(client.criarDocumento("atendimentos", {}), /registrarAtendimento/);
  await assert.rejects(client.atualizarDocumento("atendimentos", "x", { os: 10 }), /não pode ser alterada/);
});

test("Home e Atendimentos exibem a mesma OS; filtrar e ordenar não renumera", () => {
  const funcionarios = [{ id: "a", nome: "Pessoa A" }, { id: "b", nome: "Pessoa B" }];
  const atendimentos = [
    { id: "x", os: 9, funcionarioId: "a", nomeServico: "Corte A", valor: 50, comissao: 20, data: "2026-09-09T13:00:00Z" },
    { id: "y", os: 10000, funcionarioId: "b", nomeServico: "Corte B", valor: 30, comissao: 12, data: "2026-09-09T14:00:00Z" },
  ];
  function renderDashboard(filter, items) {
    let index = 0;
    const state = ["atendimentos", filter, funcionarios, [], items, false, "", "", null];
    const Dashboard = load("app/admin-dashboard.tsx", {
      react: { ...React, useState: (initial) => [index < state.length ? state[index++] : initial, () => {}], useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn },
      "@/lib/firestore-client": {},
    }).default;
    return renderToStaticMarkup(React.createElement(Dashboard));
  }
  const all = renderDashboard(null, atendimentos);
  assert.match(all, /<td[^>]*>0009<\/td>/);
  assert.match(all, /<td[^>]*>10000<\/td>/);
  const filtered = renderDashboard("b", [...atendimentos].reverse());
  assert.match(filtered, /<td[^>]*>10000<\/td>/);
  assert.doesNotMatch(filtered, /<td[^>]*>0009<\/td>/);
  for (const [employee, expected, excluded] of [[funcionarios[0], "0009", "10000"], [funcionarios[1], "10000", "0009"]]) {
    let homeState = 0;
    const Home = load("app/salon-home.tsx", {
      react: { ...React, useState: () => [homeState++ === 0 ? null : employee, () => {}], useEffect: () => {} },
    }).default;
    const home = renderToStaticMarkup(React.createElement(Home, { funcionarios, atendimentos }));
    assert.ok(home.includes(`<td>${expected}</td>`));
    assert.ok(!home.includes(`<td>${excluded}</td>`));
    assert.ok(home.includes(`Atendimentos — ${employee.nome}`));
    assert.doesNotMatch(home, /aria-pressed/);
    assert.equal((home.match(/<dialog/g) ?? []).length, 1);
    assert.match(home, />OS<\/th>/);
  }
});

test("modal da Home agrupa serviços, ordena por data e informa histórico vazio", () => {
  const employee = { id: "a", nome: "Larissa" };
  function renderHistory(atendimentos) {
    let state = 0;
    const Home = load("app/salon-home.tsx", {
      react: { ...React, useState: () => [state++ === 0 ? null : employee, () => {}], useEffect: () => {} },
    }).default;
    return renderToStaticMarkup(React.createElement(Home, { funcionarios: [employee], atendimentos })).split("<dialog")[1];
  }
  const history = renderHistory([
    { id: "old", os: 1, funcionarioId: "a", data: "2026-09-08T12:00:00Z", valor: 50, comissao: null, nomeServico: "Corte" },
    { id: "new", os: 2, funcionarioId: "a", data: "2026-09-07T12:00:00Z", dataEpochMs: Date.parse("2026-09-09T12:00:00Z"), valor: 80, comissao: 32, servicos: [{ nome: "Corte" }, { nome: "Barba" }] },
  ]);
  assert.ok(history.indexOf("<td>0002</td>") < history.indexOf("<td>0001</td>"));
  assert.match(history, /Corte, Barba/);
  assert.equal((history.match(/<tbody><tr>|<\/tr><tr>/g) ?? []).length, 2);
  assert.match(history, /Indisponível/);
  assert.match(renderHistory([]), /Nenhum atendimento encontrado para este funcionário\./);
});

test("1, 2 e 3 serviços são somados em uma OS com comissão do funcionário", async () => {
  for (const [ids, total] of [[["s"], 50], [["s", "b"], 85], [["s", "b", "c"], 105]]) {
    const { client, records } = database();
    records.set("servicos/b", { nome: "Barba", ativo: true, valor: 35, percentualComissao: 99 });
    records.set("servicos/c", { nome: "Sobrancelha", ativo: true, valor: 20 });
    const start = Date.now();
    const result = await client.registrarAtendimento({ ...input, servicoIds: ids });
    const item = records.get(`atendimentos/${result.id}`);
    assert.equal(result.os, 1);
    assert.equal(item.servicos.length, ids.length);
    assert.equal(item.valor, total);
    assert.equal(item.comissao, total * 0.4);
    assert.equal(item.percentualComissao, 40);
    assert.equal(records.get("contadores/atendimentos").ultimaOS, 1);
    assert.equal([...records.keys()].filter((key) => key.startsWith("atendimentos/")).length, 1);
    assert.equal(Date.parse(item.data), item.dataEpochMs);
    assert.ok(item.dataEpochMs >= start && item.dataEpochMs <= Date.now());
    assert.equal(item.criadoEm, "test-timestamp");
    records.set("servicos/s", { nome: "Nome alterado", valor: 999, ativo: true });
    assert.equal(item.servicos[0].nome, "Corte");
    assert.equal(item.servicos[0].valor, 50);
  }
});

test("sem comissão no funcionário não utiliza percentual legado do serviço", async () => {
  const { client, records } = database();
  records.set("funcionarios/a", { nome: "A", ativo: true });
  const result = await client.registrarAtendimento(input);
  assert.equal(records.get(`atendimentos/${result.id}`).percentualComissao, null);
  assert.equal(records.get(`atendimentos/${result.id}`).comissao, null);
});

test("validações não consomem OS e zero por cento é válido", async () => {
  const { client, records } = database();
  for (const data of [
    { ...input, funcionarioId: "" }, { ...input, clienteNome: " " },
    { ...input, servicoIds: [] }, { ...input, servicoIds: [""] },
    { ...input, servicoIds: ["s", "s"] }, { ...input, servicoIds: ["removido"] },
  ]) await assert.rejects(client.registrarAtendimento(data));
  assert.equal(records.has("contadores/atendimentos"), false);
  records.set("funcionarios/a", { nome: "A", ativo: true, percentualComissao: 0 });
  const result = await client.registrarAtendimento(input);
  assert.equal(records.get(`atendimentos/${result.id}`).comissao, 0);
});

test("formulário limpa somente após sucesso, preserva valores no erro e bloqueia envio duplo", async () => {
  for (const fail of [false, true]) {
    const state = ["a", "Cliente", [{ key: 0, id: "s" }], null, false, ""];
    let stateIndex = 0;
    let calls = 0;
    let successOS;
    let finish;
    const saving = new Promise((resolve, reject) => { finish = () => fail ? reject(new Error("Falha simulada")) : resolve({ id: "x", os: 7 }); });
    const Screen = load("app/atendimentos-screen.tsx", {
      react: { ...React, useEffect: () => {}, useRef: (value) => ({ current: value }), useState: () => {
        const index = stateIndex++;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      } },
      "@/lib/firestore-client": { registrarAtendimento: async (data) => {
        calls++;
        assert.deepEqual(data, { funcionarioId: "a", clienteNome: "Cliente", servicoIds: ["s"] });
        return saving;
      } },
    }).default;
    const tree = Screen({ funcionarios: [{ id: "a", ativo: true, percentualComissao: 40 }], servicos: [{ id: "s", ativo: true, nome: "Corte", valor: 50 }], atendimentos: [], funcionarioFiltro: null, onSaved: async (os) => { successOS = os; } });
    function findForm(node) {
      if (!node || typeof node !== "object") return null;
      if (node.type === "form") return node;
      return React.Children.toArray(node.props?.children).map(findForm).find(Boolean);
    }
    const form = findForm(tree);
    const event = { preventDefault() {} };
    const pending = form.props.onSubmit(event);
    await form.props.onSubmit(event);
    assert.equal(calls, 1);
    assert.equal(state[0], "a");
    assert.equal(state[1], "Cliente");
    finish();
    await pending;
    assert.equal(state[4], false);
    if (fail) {
      assert.equal(state[0], "a");
      assert.equal(state[1], "Cliente");
      assert.equal(state[2][0].id, "s");
      assert.equal(state[5], "Falha simulada");
      assert.equal(successOS, undefined);
    } else {
      assert.equal(state[0], "");
      assert.equal(state[1], "");
      assert.equal(state[2].length, 1);
      assert.equal(state[2][0].id, "");
      assert.equal(successOS, 7);
    }
  }
});

test("histórico preserva registro antigo e mostra vários serviços em uma única linha", () => {
  const Screen = load("app/atendimentos-screen.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Screen, {
    funcionarios: [], servicos: [], funcionarioFiltro: null, onSaved: async () => {},
    atendimentos: [
      { id: "old", data: "2026-09-01T12:00:00Z", nomeServico: "Legado", valor: 50, comissao: 20 },
      { id: "new", os: 8, data: "2026-09-09T12:00:00Z", nomeServico: "Corte, Barba", servicos: [{ nome: "Corte" }, { nome: "Barba" }], valor: 85, comissao: null },
    ],
  }));
  const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];
  assert.equal((body.match(/<tr/g) || []).length, 2);
  assert.match(body, /Corte, Barba/);
  assert.match(body, /Sem OS/);
  assert.match(body, /Legado/);
  assert.match(body, /Indisponível/);
});

test("editar mantém OS, data, contador e preços dos itens mantidos; recalcula pelo funcionário", async () => {
  const { client, records } = database();
  const original = await client.registrarAtendimento(input);
  const before = { ...records.get(`atendimentos/${original.id}`) };
  records.set("servicos/s", { nome: "Preço novo", ativo: true, valor: 999 });
  records.set("servicos/b", { nome: "Barba", ativo: true, valor: 35 });
  records.set("funcionarios/a", { nome: "A", ativo: true, percentualComissao: 35 });
  const result = await client.editarAtendimento(original.id, { ...input, servicoIds: ["s", "b"] });
  const updated = records.get(`atendimentos/${original.id}`);
  assert.equal(result.os, before.os);
  assert.equal(updated.os, before.os);
  assert.equal(updated.data, before.data);
  assert.equal(updated.dataEpochMs, before.dataEpochMs);
  assert.equal(updated.criadoEm, before.criadoEm);
  assert.equal(updated.valor, 85);
  assert.equal(updated.comissao, 29.75);
  assert.equal(updated.servicos.length, 2);
  assert.equal(records.get("contadores/atendimentos").ultimaOS, 1);
  await client.editarAtendimento(original.id, { ...input, servicoIds: ["b"] });
  assert.equal(records.get(`atendimentos/${original.id}`).valor, 35);
  assert.equal(records.get(`atendimentos/${original.id}`).os, 1);
  await assert.rejects(client.editarAtendimento(original.id, { ...input, servicoIds: ["b", "b"] }));
  await client.removerDocumento("atendimentos", original.id);
  await assert.rejects(client.editarAtendimento(original.id, input));
  const next = await client.registrarAtendimento(input);
  assert.equal(next.os, 2);
});

test("edição de legado sem OS preserva ausência de OS e não cria contador", async () => {
  const { client, records } = database();
  records.set("atendimentos/legacy", { funcionarioId: "a", servicoId: "s", nomeServico: "Corte antigo", valor: 20, comissao: 8, percentualComissao: 40, data: "2026-01-01T00:00:00Z" });
  const result = await client.editarAtendimento("legacy", input);
  assert.equal(result.os, undefined);
  assert.equal(records.get("atendimentos/legacy").os, undefined);
  assert.equal(records.get("atendimentos/legacy").valor, 20);
  assert.equal(records.get("atendimentos/legacy").data, "2026-01-01T00:00:00Z");
  assert.equal(records.has("contadores/atendimentos"), false);
});

test("lixeira da seleção limpa último item sem excluir; exclusão salva exige confirmação", async () => {
  const state = ["a", "Cliente", [{ key: 0, id: "s" }], null, false, "", null, null];
  const refs = [];
  let stateIndex;
  let refIndex;
  const deleted = [];
  const Screen = load("app/atendimentos-screen.tsx", {
    react: { ...React, useEffect: () => {}, useRef: (value) => {
      const index = refIndex++;
      return refs[index] ??= { current: value };
    }, useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    } },
    "@/lib/firestore-client": { removerDocumento: async (...args) => { deleted.push(args); } },
  }).default;
  const props = { funcionarios: [{ id: "a", ativo: true }], servicos: [{ id: "s", ativo: true, nome: "Corte", valor: 50 }], atendimentos: [{ id: "saved", os: 8, funcionarioId: "a", clienteNome: "Cliente", servicoId: "s", nomeServico: "Corte", valor: 50, data: "2026-09-09" }], funcionarioFiltro: null, onSaved: async () => {} };
  const render = () => { stateIndex = 0; refIndex = 0; return Screen(props); };
  function find(node, match) {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    return React.Children.toArray(node.props?.children).map((child) => find(child, match)).find(Boolean);
  }
  let tree = render();
  find(tree, (node) => node.props?.["aria-label"] === "Remover serviço 1").props.onClick();
  assert.equal(state[2][0].id, "");
  assert.deepEqual(deleted, []);
  tree = render();
  find(tree, (node) => node.props?.title === "Editar atendimento").props.onClick();
  assert.equal(state[6].os, 8);
  assert.equal(state[2][0].id, "s");
  tree = render();
  find(tree, (node) => node.props?.title === "Excluir atendimento").props.onClick();
  assert.deepEqual(deleted, []);
  tree = render();
  const dialog = find(tree, (node) => node.type === "dialog");
  await find(dialog, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(deleted, [["atendimentos", "saved"]]);
});

test("listener de comissões substitui totais, respeita filtros e para após unsubscribe", () => {
  let receive;
  let fail;
  let stopped = 0;
  const results = [];
  const errors = [];
  const client = load("lib/firestore-client.ts", {
    "@/lib/firebase": { db: {} },
    "firebase/firestore": {
      collection: (_, name) => name,
      where: (...args) => args,
      query: (...args) => args,
      onSnapshot: (query, next, error) => {
        assert.deepEqual(query, ["atendimentos", ["funcionarioId", "==", "a"]]);
        receive = next; fail = error;
        return () => { stopped++; };
      },
    },
  });
  const unsubscribe = client.observarComissaoPorPeriodo("a", "2026-09-09T00:00:00.000Z", "2026-09-09T23:59:59.999Z", (value) => results.push(value), (error) => errors.push(error));
  const item = (valor, percentualComissao, more = {}) => ({ funcionarioId: "a", data: "2026-09-09T14:00:00Z", valor, percentualComissao, ...more });
  const old = [item(50, 40), item(100, 20), item(35, 400 / 35)];
  const emit = (items) => receive({ docs: items.map((value) => ({ data: () => value })) });
  emit(old);
  assert.equal(results.at(-1).totalAtendimentos, 3);
  assert.equal(results.at(-1).valorTotalServicos, 185);
  assert.equal(results.at(-1).valorTotalComissao, 44);
  const updated = [...old, item(50, 40), item(999, 40, { funcionarioId: "b" }), item(999, 40, { data: "2026-09-10T00:00:00Z" })];
  emit(updated);
  assert.equal(results.at(-1).totalAtendimentos, 4);
  assert.equal(results.at(-1).valorTotalServicos, 235);
  assert.equal(results.at(-1).valorTotalComissao, 64);
  emit(updated);
  assert.equal(results.at(-1).valorTotalComissao, 64);
  emit(old);
  assert.equal(results.at(-1).totalAtendimentos, 3);
  emit([item(50, null)]);
  assert.equal(errors.length, 1);
  const count = results.length;
  unsubscribe();
  emit(updated);
  fail(new Error("Callback atrasado"));
  assert.equal(results.length, count);
  assert.equal(errors.length, 1);
  assert.equal(stopped, 1);
});

test("Comissões assina ao montar, conserva filtros e limpa listener ao desmontar", () => {
  let effect;
  const subscriptions = [];
  let stopped = 0;
  const Screen = load("app/comissoes-screen.tsx", {
    react: { ...React, useEffect: (callback) => { effect = callback; }, useState: (initial) => [initial, () => {}] },
    "@/lib/firestore-client": { observarComissaoPorPeriodo: (...args) => {
      subscriptions.push(args.slice(0, 3));
      return () => { stopped++; };
    } },
  }).default;
  const filtros = { funcionarioId: "a", inicio: "2026-09-09", fim: "2026-09-09" };
  const props = { funcionarios: [{ id: "a", nome: "A" }], filtros, onChange: () => {} };
  const first = Screen(props);
  const cleanup = effect();
  assert.deepEqual(subscriptions[0], ["a", "2026-09-09T00:00:00.000Z", "2026-09-09T23:59:59.999Z"]);
  const html = renderToStaticMarkup(first);
  assert.match(html, /value="2026-09-09"/);
  cleanup();
  assert.equal(stopped, 1);
  Screen(props);
  effect()();
  assert.deepEqual(subscriptions[1], subscriptions[0]);
  assert.equal(stopped, 2);
  Screen({ ...props, filtros: { ...filtros, inicio: "2026-09-10" } });
  assert.equal(effect(), undefined);
  assert.equal(subscriptions.length, 2);
});
