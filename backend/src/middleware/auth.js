/**
 * Session shape stored after login:
 * {
 *   userId:        string (UUID),
 *   institutionId: string (UUID),
 *   role:          'student' | 'security' | 'hall_officer' | 'admin',
 *   name:          string,
 *   identifier:    string,   // matric_no or staff_id
 *   hall:          string?,  // students & hall_officers
 *   room:          string?,  // students only
 * }
 */

function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (roles.length && !roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Access denied for your role.' });
    }
    next();
  };
}

module.exports = { requireAuth };
