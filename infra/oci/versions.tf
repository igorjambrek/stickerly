terraform {
  required_version = ">= 1.5"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

# Reads ~/.oci/config, so the CLI and Terraform always agree about who we are.
provider "oci" {
  config_file_profile = var.oci_profile
  region              = var.region
}
