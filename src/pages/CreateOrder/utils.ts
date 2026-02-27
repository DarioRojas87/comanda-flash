/** Generate a short unique id for cart unit instances */
export const uid = () => Math.random().toString(36).slice(2, 9)
