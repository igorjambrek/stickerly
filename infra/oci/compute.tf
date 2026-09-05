# Latest Ubuntu 24.04 for aarch64. Pinning an image OCID would go stale; this
# picks up whatever Canonical published most recently for the A1 shape.
data "oci_core_images" "ubuntu" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "app" {
  compartment_id      = var.tenancy_ocid
  availability_domain = local.ad
  display_name        = "${var.name}-app"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  create_vnic_details {
    subnet_id = oci_core_subnet.public.id
    # No ephemeral IP: the reserved one below takes this VNIC's place instead,
    # so rebuilding the instance does not change the address in DNS.
    assign_public_ip = false
    hostname_label   = var.name
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(file("${path.module}/cloud-init.yaml"))
  }

  # The image is chosen at plan time, so a new Ubuntu release would otherwise
  # show up as a pending instance replacement on every apply.
  lifecycle {
    ignore_changes = [source_details[0].source_id]
  }
}

data "oci_core_vnic_attachments" "app" {
  compartment_id      = var.tenancy_ocid
  instance_id         = oci_core_instance.app.id
  availability_domain = local.ad
}

data "oci_core_private_ips" "app" {
  vnic_id = data.oci_core_vnic_attachments.app.vnic_attachments[0].vnic_id
}

# The address the DNS records point at. Reserved rather than ephemeral so it
# outlives the instance — the GoDaddy records never have to change again.
resource "oci_core_public_ip" "app" {
  compartment_id = var.tenancy_ocid
  display_name   = "${var.name}-ip"
  lifetime       = "RESERVED"
  private_ip_id  = data.oci_core_private_ips.app.private_ips[0].id
}
