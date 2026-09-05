function createAuth(validUsers) {
  function isValidUser(username, password) {
    return typeof username === 'string' && typeof password === 'string' &&
      password.length > 0 && Object.hasOwn(validUsers, username) &&
      validUsers[username] === password;
  }

  function requireAuth(req, res, next) {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(req.get('Authorization') || '');
    if (match) {
      const credentials = Buffer.from(match[1], 'base64').toString('utf8');
      const separator = credentials.indexOf(':');
      const username = credentials.slice(0, separator);
      const password = credentials.slice(separator + 1);
      if (separator > 0 && isValidUser(username, password)) {
        req.username = username;
        return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="secret-chat", charset="UTF-8"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return { isValidUser, requireAuth };
}

module.exports = { createAuth };
