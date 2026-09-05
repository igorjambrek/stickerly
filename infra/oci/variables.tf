variable "oci_profile" {
  description = "Profile in ~/.oci/config to authenticate with."
  type        = string
  default     = "DEFAULT"
}

variable "tenancy_ocid" {
  description = "Tenancy OCID. Also the root compartment — everything here is created in it."
  type        = string
}

variable "region" {
  description = "Region to deploy into. Must be one the tenancy is subscribed to."
  type        = string
  default     = "eu-frankfurt-1"
}

variable "availability_domain" {
  description = <<-EOT
    Which AD to launch in, 1-based. Ampere capacity comes and goes per AD, so if
    a launch fails with "Out of host capacity", change this and re-apply.
  EOT
  type        = number
  default     = 1
}

variable "name" {
  description = "Prefix for every resource, so they are recognisable in the console."
  type        = string
  default     = "nalepko"
}

# --- Always Free envelope ------------------------------------------------
# The Ampere A1 allowance is 4 OCPUs and 24 GB of memory in total, and 200 GB
# of block storage. These defaults spend the compute allowance on one instance
# and a small fraction of the storage. Raising either starts costing money.

variable "ocpus" {
  description = "OCPUs for the instance. 4 is the whole Always Free A1 allowance."
  type        = number
  default     = 4
}

variable "memory_in_gbs" {
  description = "Memory for the instance. 24 is the whole Always Free A1 allowance."
  type        = number
  default     = 24
}

variable "boot_volume_size_in_gbs" {
  description = "Boot volume size. Album database and photos live here."
  type        = number
  default     = 50
}

variable "ssh_public_key" {
  description = "Public key placed on the instance for the 'ubuntu' user."
  type        = string
}

variable "ssh_ingress_cidr" {
  description = "Who may reach port 22. Narrow this to your own address if you like."
  type        = string
  default     = "0.0.0.0/0"
}
