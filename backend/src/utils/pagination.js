const DEFAULT_PAGE = 1;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolvePagination = (query, { defaultLimit = 25, maxLimit = 200 } = {}) => {
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  const page = toPositiveInt(query.page, DEFAULT_PAGE);
  const offset = (page - 1) * limit;

  return {
    limit,
    page,
    offset,
    buildMeta: (count) => ({
      page,
      limit,
      total: count,
      totalPages: count > 0 ? Math.ceil(count / limit) : 0
    })
  };
};

module.exports = {
  resolvePagination
};
