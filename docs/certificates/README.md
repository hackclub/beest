# Certificates

Beest certificates recognize users for fulfilled shop orders once total qualifying spending reaches 30 Pipes.

## Normal-Item Certificates
Normal-item certificates aggregate fulfilled non-grant shop orders for a user.
They are issued after the combined total exceeds or equals 30 Pipes and list each
distinct purchased item name (comma-separated, e.g. "Keyboard, Mouse").
The database permits at most one aggregate normal-item certificate per user (`UQ_certificates_normal_user`).

## Grant Certificates
Grant certificates aggregate fulfilled grant orders per user.
They are issued once cumulative grant spending reaches 30 Pipes ($150 USD equivalent value at $5/pipe).
