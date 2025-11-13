import type { NextApiRequest, NextApiResponse } from 'next'  
import apiWrapper from 'lib/api/apiWrapper'  
  
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090'  
  
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)  
  
async function handler(req: NextApiRequest, res: NextApiResponse) {  
  const { method } = req  
  
  switch (method) {  
    case 'GET':  
      return handleGetAll(req, res)  
    default:  
      res.setHeader('Allow', ['GET'])  
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })  
  }  
}  
  
/**  
 * Query Prometheus for a specific metric  
 */  
async function queryPrometheus(query: string, startTime: string, endTime: string, step: string) {
  try {
    const url = new URL(`${PROMETHEUS_URL}/api/v1/query_range`)
    url.searchParams.append('query', query)
    url.searchParams.append('start', `${new Date(startTime).getTime() / 1000}`)
    url.searchParams.append('end', `${new Date(endTime).getTime() / 1000}`)
    url.searchParams.append('step', step)

    const response = await fetch(url.toString())
    const data = await response.json()

    if (data.status !== 'success') {
      throw new Error(`Prometheus query failed: ${data.error}`)
    }

    return data.data.result
  } catch (error) {
    console.error('Error querying Prometheus:', error)
    throw error
  }
}
  
/**  
 * Map attribute names to Prometheus queries  
 */  
function getPrometheusQuery(attribute: string): string | null {    
  const queries: Record<string, string> = {    
    // Memory metrics (Team/Enterprise - raw bytes)    
    ram_usage_used: 'node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes',    
    ram_usage_cache_and_buffers: 'node_memory_Cached_bytes + node_memory_Buffers_bytes',    
    ram_usage_free: 'node_memory_MemAvailable_bytes',    
        
    // Memory usage percentage (Free/Pro)    
    ram_usage: '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',    
        
    // CPU metrics    
    avg_cpu_usage: '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))',    
    max_cpu_usage: '100 * (1 - min(rate(node_cpu_seconds_total{mode="idle"}[5m])))',    
    cpu_usage_busy_system: '100 * avg(rate(node_cpu_seconds_total{mode="system"}[5m]))',    
    cpu_usage_busy_user: '100 * avg(rate(node_cpu_seconds_total{mode="user"}[5m]))',    
    cpu_usage_busy_iowait: '100 * avg(rate(node_cpu_seconds_total{mode="iowait"}[5m]))',    
    cpu_usage_busy_irqs: '100 * avg(rate(node_cpu_seconds_total{mode="irq"}[5m]) + rate(node_cpu_seconds_total{mode="softirq"}[5m]))',    
    cpu_usage_busy_other: '100 * avg(rate(node_cpu_seconds_total{mode=~"nice|steal|guest|guest_nice"}[5m]))',    
        
    // Disk I/O metrics    
    disk_iops_read: 'rate(node_disk_reads_completed_total[5m])',    
    disk_iops_write: 'rate(node_disk_writes_completed_total[5m])',    
    disk_io_consumption: '100 * (rate(node_disk_io_time_seconds_total[5m]) / 1)',    
    disk_io_budget: '100 - (100 * (rate(node_disk_io_time_seconds_total[5m]) / 1))',  
      
    // NEW: Disk I/O usage percentage  
    disk_io_usage: '100 * rate(node_disk_io_time_seconds_total[5m])',  
        
    // Database connections    
    pg_stat_database_num_backends: 'pg_stat_database_numbackends',    
    supavisor_connections_active: 'supavisor_pool_client_active_connections',    
        
    // Client connections by role  
    // NEW: Direct Postgres connections (sum of all connections)  
    client_connections_postgres: 'sum(pg_stat_database_numbackends)',  
      
    // NEW: PostgREST/authenticator connections  
    client_connections_authenticator: 'sum(pg_stat_database_numbackends{usename="authenticator"})',  
      
    client_connections_pgbouncer: 'sum(pg_stat_database_numbackends{datname="pgbouncer"})',    
    client_connections_postgrest: 'sum(pg_stat_database_numbackends{usename="authenticator"})',    
    client_connections_supabase_admin: 'sum(pg_stat_database_numbackends{usename="supabase_admin"})',    
    client_connections_supabase_auth_admin: 'sum(pg_stat_database_numbackends{usename="supabase_auth_admin"})',    
    client_connections_supabase_storage_admin: 'sum(pg_stat_database_numbackends{usename="supabase_storage_admin"})',    
    client_connections_other: 'sum(pg_stat_database_numbackends{usename!~"authenticator|supabase_admin|supabase_auth_admin|supabase_storage_admin"})',  
      
    // NEW: Disk usage metrics (requires postgres_exporter with custom queries)  
    // These metrics need to be exported by postgres_exporter using custom queries  
    disk_fs_used_system: 'pg_disk_usage_system_bytes',  
    disk_fs_used_wal: 'pg_stat_wal_size_bytes',  
    pg_database_size: 'pg_database_size_bytes',  
    disk_fs_size: 'node_filesystem_size_bytes{mountpoint="/"}',  
  }    
    
  return queries[attribute] || null    
}

  
/**  
 * Convert interval string to Prometheus step format  
 */  
function getPrometheusStep(interval: string): string {  
  const intervalMap: Record<string, string> = {  
    '1m': '1m',  
    '5m': '5m',  
    '1h': '1h',  
    '1d': '1d',  
  }  
  return intervalMap[interval] || '1h'  
}  
  
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {  
  try {  
    const { attribute, startDate, endDate, interval = '1h', databaseIdentifier } = req.query  
  
    if (!attribute || typeof attribute !== 'string') {  
      return res.status(400).json({  
        data: [],  
        yAxisLimit: 0,  
        format: '%',  
        total: 0,  
        error: 'Missing or invalid attribute parameter',  
      })  
    }  
  
    if (!startDate || !endDate) {  
      return res.status(400).json({  
        data: [],  
        yAxisLimit: 0,  
        format: '%',  
        total: 0,  
        error: 'Missing startDate or endDate parameters',  
      })  
    }  
  
    // Get the Prometheus query for this attribute  
    const prometheusQuery = getPrometheusQuery(attribute)  
      
    if (!prometheusQuery) {  
      return res.status(400).json({  
        data: [],  
        yAxisLimit: 0,  
        format: '%',  
        total: 0,  
        error: `Unknown attribute: ${attribute}`,  
      })  
    }  
  
    // Query Prometheus  
    const step = getPrometheusStep(interval as string)  
    const results = await queryPrometheus(  
      prometheusQuery,  
      startDate as string,  
      endDate as string,  
      step  
    )  
  
    // Transform Prometheus results to the expected format  
    const data = []  
    let total = 0  
    let maximum = 0  
  
    if (results && results.length > 0) {  
      const values = results[0].values || []  
        
      for (const [timestamp, value] of values) {  
        const numValue = parseFloat(value)  
        const dataPoint = {  
          period_start: new Date(timestamp * 1000).toISOString(),  
          [attribute]: numValue,  
        }  
        data.push(dataPoint)  
        total += numValue  
        maximum = Math.max(maximum, numValue)  
      }  
    }  
  
    // Determine format based on attribute  
    const format = attribute.includes('ram_usage') && !attribute.includes('_usage_')  
      ? 'bytes'  
      : attribute.includes('cpu') || attribute.includes('ram_usage')  
      ? '%'  
      : ''  
  
    const response = {  
      data,  
      yAxisLimit: maximum,  
      format,  
      total: data.length > 0 ? total / data.length : 0,  
    }  
  
    return res.status(200).json(response)  
  } catch (error: any) {  
    console.error('Error in infra-monitoring handler:', error)  
    return res.status(500).json({  
      data: [],  
      yAxisLimit: 0,  
      format: '%',  
      total: 0,  
      error: error.message || 'Internal server error',  
    })  
  }  
}