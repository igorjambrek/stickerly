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
# The Ampere A1 allowance is 2 OCPUs and 12 GB of memory in total (it was
# 4 / 24 until Oracle halved it), and 200 GB of block storage, shared by every
# instance in the tenancy. Going over it is not a bill: the instance is
# disabled once the trial ends, and deleted 30 days later.
#
# Sized to what the album really uses rather than to the allowance, for a
# second reason: Oracle reclaims an instance whose CPU p95, network and memory
# all stay under 20% for a week. Memory is the only one of the three this app
# can stay above, so memory_in_gbs has to stay small. Measured (MemoryUtilization
# in oci_computeagent): ~1 GB in use on 24 GB, but only ~0.6 GB on 3 GB — the
# box uses less when it has less, which put 3 GB right on the 20% line. On 2 GB
# it is ~30%. A full image build on 1 OCPU / 2 GB, with the app still running
# beside it, peaks at 1.25 GB and takes four minutes.

variable "ocpus" {
  description = "OCPUs for the instance. The Always Free A1 allowance is 2 in total."
  type        = number
  default     = 1
}

variable "memory_in_gbs" {
  description = "Memory for the instance. The Always Free A1 allowance is 12 in total."
  type        = number
  default     = 2
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
