export const isAdmin = (user) => {
    // Replace with your admin logic or specific usernames
    const ADMINS = ['admin', 'abizer']; 
    if (!user) return false;
    return ADMINS.includes(typeof user === 'string' ? user : user.username);
};