import { authHandlers } from './auth'
import { farmHandlers } from './farms'
import { pondDetailHandlers } from './pond'
import { pondHandlers } from './ponds'
import { reportHandlers } from './reports'

export const handlers = [...authHandlers, ...farmHandlers, ...pondHandlers, ...pondDetailHandlers, ...reportHandlers]
