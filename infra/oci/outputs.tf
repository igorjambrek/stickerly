output "public_ip" {
  description = "Point both A records at this."
  value       = oci_core_public_ip.app.ip_address
}

output "ssh" {
  description = "How to get on the box."
  value       = "ssh -i ~/.ssh/nalepko_oci ubuntu@${oci_core_public_ip.app.ip_address}"
}

output "dns_records" {
  description = "What to add at the registrar, relative to jambrek.com."
  value = {
    "nalepko"     = oci_core_public_ip.app.ip_address
    "api.nalepko" = oci_core_public_ip.app.ip_address
  }
}
