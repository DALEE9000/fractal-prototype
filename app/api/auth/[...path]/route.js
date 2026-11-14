import { getAuth } from '../../../../lib/auth.js';

const forward = (request, context) => getAuth().handler()[request.method](request, context);
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
