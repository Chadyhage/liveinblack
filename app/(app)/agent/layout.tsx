import styles from './agent.module.css'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.workspace}>{children}</div>
}
