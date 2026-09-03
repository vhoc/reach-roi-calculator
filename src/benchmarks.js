/**
 * Observed anonymized Reach customer benchmarks. Fixed constants — do not
 * alter, average, or substitute. Hours are PER APPLICABLE FTE, PER MONTH.
 * `color` drives only the donut and its legend, never the maths.
 *
 * This is the single source of truth: the task rows in the inputs view are
 * rendered from this array by tasks.js, so a change here updates the UI,
 * the results table, and the PDF together.
 */
export const TASK_BENCHMARKS = [
  { id: "security-controls-review", name: "Security Controls Review", description: "Reviewing rules, settings, configurations, and control effectiveness", manualHoursPerFTEPerMonth: 25, reachHoursPerFTEPerMonth: 5, reductionRate: 0.80, color: "#4C8DFF" },
  { id: "visibility-gap-identification", name: "Visibility Gap Identification", description: "Finding blind spots and coverage gaps across security controls", manualHoursPerFTEPerMonth: 15, reachHoursPerFTEPerMonth: 2, reductionRate: 13 / 15, color: "#6FA4FF" },
  { id: "config-remediation-deployment", name: "Configuration Remediation and Deployment", description: "Implementing security control changes and remediation", manualHoursPerFTEPerMonth: 12, reachHoursPerFTEPerMonth: 3, reductionRate: 0.75, color: "#2FBFA0" },
  { id: "tools-rationalization-assessment", name: "Tools Rationalization Assessment", description: "Evaluating security tool overlap, underuse, and effectiveness", manualHoursPerFTEPerMonth: 10, reachHoursPerFTEPerMonth: 2, reductionRate: 0.80, color: "#56D9B6" },
  { id: "executive-reporting-metrics", name: "Executive Reporting & Metrics", description: "Preparing security posture reporting and executive metrics", manualHoursPerFTEPerMonth: 12, reachHoursPerFTEPerMonth: 2, reductionRate: 10 / 12, color: "#7FE9CD" },
  { id: "prioritization-security-work", name: "Prioritization of Security Work", description: "Determining which security issues and changes to address first", manualHoursPerFTEPerMonth: 8, reachHoursPerFTEPerMonth: 1, reductionRate: 7 / 8, color: "#E8B563" },
  { id: "endpoint-health", name: "Endpoint Security Health", description: "Assessing endpoint security control health and coverage", manualHoursPerFTEPerMonth: 10, reachHoursPerFTEPerMonth: 3, reductionRate: 0.70, color: "#F0C987" },
  { id: "network-security-health", name: "Network Security Health", description: "Assessing the health and coverage of firewall rules and other network security controls", manualHoursPerFTEPerMonth: 10, reachHoursPerFTEPerMonth: 1.4, reductionRate: 0.86, color: "#89C7A6" },
  { id: "compliance-audit-readiness", name: "Compliance & Audit Readiness", description: "Gathering and validating security evidence for audits and compliance", manualHoursPerFTEPerMonth: 15, reachHoursPerFTEPerMonth: 3, reductionRate: 0.80, color: "#B0B6E4" },
  { id: "attack-modeling-threat-actor-mapping", name: "Attack Modeling & Threat Actor Mapping", description: "Mapping exposures and security controls to attack paths and threat actors", manualHoursPerFTEPerMonth: 10, reachHoursPerFTEPerMonth: 1, reductionRate: 0.90, color: "#9BC0FF" },
];


/** @returns {object|undefined} the benchmark with this id */
export const benchmarkById = (id) => TASK_BENCHMARKS.find((b) => b.id === id);
