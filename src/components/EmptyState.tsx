import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import CarAnimation from '../ui/CarAnimation'
import { itemVariants, listVariants } from '../ui/motion'

/** État vide : la petite voiture roule, le texte et les actions arrivent en cascade. */
export default function EmptyState({ icon, title, text, children }: {
  icon: string; title: string; text?: string; children?: ReactNode
}) {
  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col items-center gap-2 py-10 text-center">
      <motion.div variants={itemVariants} aria-hidden className="relative">
        <CarAnimation size={150} className="opacity-90" />
        <span className="absolute -right-2 -top-2 text-3xl">{icon}</span>
      </motion.div>
      <motion.h2 variants={itemVariants} className="text-lg font-semibold">{title}</motion.h2>
      {text && <motion.p variants={itemVariants} className="max-w-xs text-muted">{text}</motion.p>}
      {children && <motion.div variants={itemVariants}>{children}</motion.div>}
    </motion.div>
  )
}
