# Segregated, Pending Verification and Verified belonged to an earlier flow (sorting the trash,
# then CENRO checking the robot's counts) that nothing sets any more: a cleanup is Completed once
# its trash report is filed. Requests left in them become Completed.
from django.db import migrations, models

RETIRED = ('segregated', 'pending_verification', 'verified')


def to_completed(apps, schema_editor):
    Request = apps.get_model('troid_api', 'Request')
    Request.objects.filter(status__in=RETIRED).update(status='completed')
    # A request merged into another keeps the status it had, to go back to if unmerged.
    Request.objects.filter(merged_from_status__in=RETIRED).update(merged_from_status='completed')
    Request.objects.filter(parked_from_status__in=RETIRED).update(parked_from_status='completed')


class Migration(migrations.Migration):

    dependencies = [
        ('troid_api', '0053_trash_items'),
    ]

    operations = [
        migrations.RunPython(to_completed, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='request',
            name='status',
            field=models.CharField(choices=[('pending_mayor_approval', 'Pending City Admin Approval'), ('pending_admin_approval', 'Pending Admin Approval'), ('approved', 'Approved'), ('ongoing', 'Ongoing'), ('declined', 'Declined'), ('parked', 'Parked'), ('processing', 'Processing'), ('completed', 'Completed'), ('merged', 'Merged')], default='pending_mayor_approval', max_length=30),
        ),
    ]
