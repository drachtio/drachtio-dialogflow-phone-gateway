module.exports = parseExpires;

function parseExpires(res) {
  const contact = res.getParsedHeader('Contact') ;
  if (contact[0].params && contact[0].params.expires) return parseInt(contact[0].params.expires);
  if (res.has('Expires')) return parseInt(res.get('Expires'));
  return null;
}
