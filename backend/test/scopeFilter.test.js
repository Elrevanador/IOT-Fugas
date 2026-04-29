const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createScopeFilter } = require("../src/middlewares/scopeFilter");

// Mock del req.user
const createMockReq = (user) => ({
  user,
  query: {}
});

const createMockRes = () => ({});

describe("Scope Filter Middleware", () => {
  it("debe aplicar scope cuando usuario tiene casa restringida", () => {
    const middleware = createScopeFilter();
    const req = createMockReq({ id: 1, role: "resident", houseId: 5 });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert(nextCalled, "next() debe ser llamado");
    assert(req.scopeFilter, "req.scopeFilter debe existir");
    assert.equal(req.scopeFilter.houseScopedId, 5, "houseScopedId debe ser 5");

    const where = {};
    req.scopeFilter.applyToWhere(where);
    assert.equal(where.house_id, 5, "debe aplicar house_id al where");
  });

  it("no debe aplicar scope cuando usuario es admin", () => {
    const middleware = createScopeFilter();
    const req = createMockReq({ id: 1, role: "admin" });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert(nextCalled, "next() debe ser llamado");
    assert.equal(req.scopeFilter.houseScopedId, null, "houseScopedId debe ser null");

    const where = {};
    req.scopeFilter.applyToWhere(where);
    assert(!where.house_id, "no debe aplicar house_id cuando no hay scope");
  });

  it("debe usar query param cuando no hay scope de usuario", () => {
    const middleware = createScopeFilter();
    const req = createMockReq({ id: 1, role: "admin" });
    req.query.houseId = "10";
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    const where = {};
    req.scopeFilter.applyToWhere(where, "houseId");
    assert.equal(where.house_id, 10, "debe usar query param houseId");
  });
});