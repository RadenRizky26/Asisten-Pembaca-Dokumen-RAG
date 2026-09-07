export interface JwtPayload { userId: number; email: string; iat?: number; exp?: number; }
export interface RegisterInput { email: string; password: string; }
export interface LoginInput { email: string; password: string; }
export interface AuthUser { id: number; email: string; }
