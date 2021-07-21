export default function (route): void {
  // TODO: next major version, remove this
  route.get('/-/all(/since)?', function (_req, res) {
    res.status(404);
    res.json({ error: 'not found, endpoint was removed' });
  });
}
