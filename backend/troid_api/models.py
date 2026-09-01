from django.db import models
from django.contrib.auth.hashers import make_password

class Boat(models.Model):
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=False)
    is_online = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    last_latitude = models.FloatField(null=True, blank=True)
    last_longitude = models.FloatField(null=True, blank=True)
    battery_level = models.FloatField(null=True, blank=True)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class DetectionEvent(models.Model):
    boat = models.ForeignKey(Boat, on_delete=models.CASCADE, related_name='detections')
    request = models.ForeignKey('Request', on_delete=models.SET_NULL, null=True, blank=True, related_name='detection_events')
    timestamp = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    trash_count = models.IntegerField(default=1)
    categories = models.JSONField(default=dict, blank=True)
    confidence = models.FloatField(default=0.0)
    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return f"Detection by {self.boat.name} at {self.timestamp}"

class User(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('mayorsoffice', "Mayor's Office"),
        ('barangay', 'Barangay'),
        ('ngo', 'NGO'),
        ('operator', 'Operator'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('offline', 'Offline'),
        ('archived', 'Archived'),
    ]
    user_id = models.CharField(max_length=10, unique=True, blank=True, null=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128, default='')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    location = models.CharField(max_length=100, blank=True)
    date_created = models.DateTimeField(auto_now_add=True)
    must_change_password = models.BooleanField(default=False)
    session_token = models.CharField(max_length=64, blank=True, null=True, default=None)

    TYPE_CODE_MAP = {
        'admin': '03',
        'mayorsoffice': '04',
        'barangay': '05',
        'ngo': '06',
        'operator': '07',
    }

    def save(self, *args, **kwargs):
        if not self.user_id:
            type_code = self.TYPE_CODE_MAP.get(self.role, '00')
            from datetime import datetime
            year_code = str(datetime.now().year)[-2:]
            same_type_count = self.__class__.objects.filter(role=self.role).exclude(pk=self.pk).count()
            nth = str(same_type_count).zfill(3)
            self.user_id = f'{type_code}{year_code}{nth}'
        if self.password and not self.password.startswith('pbkdf2_'):
            self.password = make_password(self.password)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Operator(models.Model):
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('unavailable', 'Unavailable'),
    ]
    AVAILABILITY_CHOICES = [
        ('assigned', 'Assigned'),
        ('available', 'Available'),
        ('unavailable', 'Unavailable'),
    ]
    operator_id = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    assigned_bot = models.ForeignKey(Boat, on_delete=models.SET_NULL, null=True, blank=True, related_name='operators')
    availability = models.CharField(max_length=20, choices=AVAILABILITY_CHOICES, default='available')
    archived = models.BooleanField(default=False)
    # The operator's mobile-app login. Nullable so existing roster-only operators (created
    # before accounts existed) keep working without one.
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='operator_profile')

    def save(self, *args, **kwargs):
        if not self.operator_id:
            last_id = Operator.objects.exclude(pk=self.pk).order_by('-id').first()
            next_num = (last_id.id + 1) if last_id else 1
            self.operator_id = f'OP-{str(next_num).zfill(4)}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Request(models.Model):
    STATUS_CHOICES = [
        ('pending_mayor_approval', 'Pending Mayor Approval'),
        ('pending_admin_approval', 'Pending Admin Approval'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('parked', 'Parked'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('segregated', 'Segregated'),
        ('pending_verification', 'Pending Verification'),
        ('verified', 'Verified'),
    ]
    request_id = models.CharField(max_length=20, unique=True, blank=True)
    request_type = models.CharField(max_length=50, default='Cleanup')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending_mayor_approval')
    date_submitted = models.DateTimeField(auto_now_add=True)
    requested_by_name = models.CharField(max_length=100, blank=True)
    requested_by_role = models.CharField(max_length=50, default='barangay')
    requested_by_barangay = models.CharField(max_length=100, blank=True)
    contact = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, null=True, default="")
    location_name = models.CharField(max_length=100, blank=True)
    barangay = models.CharField(max_length=100, blank=True)
    municipality = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    preferred_date = models.CharField(max_length=20, blank=True, default="")
    preferred_time = models.CharField(max_length=10, blank=True, default="")
    archived = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    decline_reason = models.TextField(blank=True, default="")
    parked_from_status = models.CharField(max_length=30, blank=True, default="")
    letter_file_name = models.CharField(max_length=100, blank=True)
    letter_size = models.CharField(max_length=20, blank=True)
    bot_id = models.ForeignKey(Boat, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests', db_column='bot_id')
    operator = models.ForeignKey(Operator, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests')
    collection_area = models.ForeignKey('CollectionArea', on_delete=models.SET_NULL, null=True, blank=True, related_name='requests')
    bags = models.IntegerField(null=True, blank=True)
    weight_kg = models.FloatField(null=True, blank=True)
    non_usable_kg = models.FloatField(null=True, blank=True)
    recyclable_kg = models.FloatField(null=True, blank=True)
    session_completed_at = models.DateTimeField(null=True, blank=True)
    trash_categories = models.JSONField(default=dict, blank=True)
    verified_categories = models.JSONField(default=dict, blank=True)
    verification_notes = models.TextField(blank=True, default="")
    verified_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.request_id:
            last_req = Request.objects.exclude(pk=self.pk).order_by('-id').first()
            next_num = (last_req.id + 1) if last_req else 1
            self.request_id = f'REQ-{str(next_num).zfill(4)}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.request_id

class StatusHistory(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name='status_history')
    label = models.CharField(max_length=50)
    date = models.DateTimeField()
    actor = models.CharField(max_length=100)
    role = models.CharField(max_length=50)
    state = models.CharField(max_length=20, default='done')
    details = models.TextField(blank=True, default="")

    def __str__(self):
        return f"{self.request.request_id} - {self.label}"

class Notification(models.Model):
    TYPE_CHOICES = [
        ('approved', 'Approved'),
        ('rescheduled', 'Rescheduled'),
        ('report_filed', 'Report Filed'),
        ('verified', 'Verified'),
    ]
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    request = models.ForeignKey(Request, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    notif_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=150)
    message = models.TextField(blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.recipient.email} - {self.title}"

class Photo(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name='photos')
    label = models.CharField(max_length=100)
    date = models.CharField(max_length=50)
    photo_id = models.IntegerField()
    image_data = models.TextField(blank=True)

    def __str__(self):
        return f"{self.request.request_id} - Photo {self.photo_id}"

class DeploymentSchedule(models.Model):
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('available', 'Available'),
        ('maintenance', 'Maintenance'),
        ('none', 'None'),
    ]
    CLEANUP_TYPE_CHOICES = [
        ('troid_supported', 'TROID Supported'),
        ('unsupported', 'Unsupported'),
    ]
    bot = models.ForeignKey(Boat, on_delete=models.CASCADE, related_name='deployments')
    day = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='none')
    label = models.CharField(max_length=20, default='Available')
    zone = models.CharField(max_length=100, blank=True)
    request_id = models.CharField(max_length=20, blank=True, null=True)
    cleanup_type = models.CharField(max_length=20, choices=CLEANUP_TYPE_CHOICES, default='troid_supported')

    class Meta:
        unique_together = ['bot', 'day']

    def __str__(self):
        return f"{self.bot.name} - {self.day}"

class PriorityArea(models.Model):
    """Auto-identified when a barangay's recent trash reports cross a volume threshold —
    see check_and_schedule_priority_followup(). Records the follow-up DeploymentSchedule
    entry created for it (if a bot was available) so it can be audited/tested."""
    barangay = models.CharField(max_length=100)
    total_bags = models.IntegerField()
    window_days = models.IntegerField(default=30)
    identified_at = models.DateTimeField(auto_now_add=True)
    deployment_schedule = models.ForeignKey(
        DeploymentSchedule, on_delete=models.SET_NULL, null=True, blank=True, related_name='priority_areas'
    )
    bot = models.ForeignKey(Boat, on_delete=models.SET_NULL, null=True, blank=True)
    scheduled_day = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"{self.barangay} - {self.total_bags} bags"

class LandfillRecord(models.Model):
    record_id = models.CharField(max_length=20, unique=True)
    barangay = models.CharField(max_length=100)
    date = models.CharField(max_length=20)
    bags = models.IntegerField()
    weight_kg = models.FloatField()
    bot = models.ForeignKey(Boat, on_delete=models.SET_NULL, null=True, related_name='landfill_records')
    operator = models.ForeignKey(Operator, on_delete=models.SET_NULL, null=True, related_name='landfill_records')
    vehicle = models.CharField(max_length=20)
    disposed_by = models.CharField(max_length=100)

    def __str__(self):
        return self.record_id

class RecyclingRecord(models.Model):
    record_id = models.CharField(max_length=20, unique=True)
    barangay = models.CharField(max_length=100)
    date = models.CharField(max_length=20)
    bags = models.IntegerField()
    weight_kg = models.FloatField()
    category = models.CharField(max_length=50)
    bot = models.ForeignKey(Boat, on_delete=models.SET_NULL, null=True, related_name='recycling_records')
    operator = models.ForeignKey(Operator, on_delete=models.SET_NULL, null=True, related_name='recycling_records')
    buyer = models.CharField(max_length=100)
    sold_at = models.CharField(max_length=20)

    def __str__(self):
        return self.record_id

class SegregationRecord(models.Model):
    zone = models.CharField(max_length=100)
    date = models.CharField(max_length=20)
    total_bags = models.IntegerField()
    total_weight_kg = models.FloatField()
    non_usable_weight_kg = models.FloatField()
    recyclable_weight_kg = models.FloatField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.zone} - {self.date}"

class AuditLog(models.Model):
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('warning', 'Warning'),
    ]

    time = models.CharField(max_length=50)
    user = models.CharField(max_length=100)
    role = models.CharField(max_length=50)
    action = models.CharField(max_length=100)
    details = models.CharField(max_length=200)
    module = models.CharField(max_length=50)
    ip = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='success')

    def __str__(self):
        return f"{self.time} - {self.action}"

class CollectionArea(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
    ]
    area_id = models.CharField(max_length=20, unique=True, blank=True)
    name = models.CharField(max_length=100)
    barangay = models.CharField(max_length=100, blank=True)
    submitted_by = models.CharField(max_length=100, blank=True)
    points = models.JSONField(default=list)
    closed = models.BooleanField(default=True)
    color = models.CharField(max_length=7, default='#1b4de4', blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    decline_reason = models.TextField(blank=True, default="")
    reviewed_by = models.CharField(max_length=100, blank=True, default="")
    date_submitted = models.DateTimeField(auto_now_add=True)
    date_reviewed = models.DateTimeField(null=True, blank=True)
    archived = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.area_id:
            last = CollectionArea.objects.exclude(pk=self.pk).order_by('-id').first()
            next_num = (last.id + 1) if last else 1
            self.area_id = f'CA-{str(next_num).zfill(4)}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.area_id

class HeatmapData(models.Model):
    latitude = models.FloatField()
    longitude = models.FloatField()
    weight = models.FloatField()
    source_type = models.CharField(max_length=20, default='waste')
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.latitude}, {self.longitude}"
