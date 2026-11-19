import { AsyncLocalStorage } from 'node:async_hooks'

export const requestUser = new AsyncLocalStorage()
export const currentUser = () => requestUser.getStore()
