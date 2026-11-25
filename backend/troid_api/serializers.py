import base64
import binascii
import os
import re

from django.utils import timezone
from rest_framework import serializers
from . import boundaries, water
from .models import Boat, DetectionEvent, User, Operator, Request, StatusHistory, Photo, DeploymentSchedule, LandfillRecord, RecyclingRecord, SegregationRecord, AuditLog, HeatmapData, CollectionArea, Notification

LETTER_MAX_BYTES = 5 * 1024 * 1024
# Extension -> (content type, the bytes a real file of that type starts with).
LETTER_TYPES = {
    '.pdf': ('application/pdf', b'%PDF-'),
    '.doc': ('application/msword', b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'),
    '.docx': ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', b'PK\x03\x04'),
}

from .drives import TRASH_ITEMS

# Filed with the trash report (submit_trash_report), beside the bags, weights and item counts.
TRASH_REPORT_FIELDS = ['trash_items', 'site_type', 'people_count', 'hours_spent', 'distance_km', 'entangled_animals',
                       'peculiar_item']

class LetterUploadSerializer(serializers.Serializer):
    """A request's letter: a PDF or Word file sent as base64 (a data URL is fine)."""
    name = serializers.CharField(max_length=255)
    data = serializers.CharField(max_length=LETTER_MAX_BYTES * 2)

    def validate(self, attrs):
        name = attrs['name'].replace('\\', '/').rsplit('/', 1)[-1]
        stem, extension = os.path.splitext(name)
        extension = extension.lower()
        if extension not in LETTER_TYPES:
            raise serializers.ValidationError('Only PDF or Word files can be attached.')
        content_type, signature = LETTER_TYPES[extension]

        encoded = attrs['data']
        if encoded.startswith('data:'):
            encoded = encoded.split(',', 1)[-1]
        try:
            content = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError('The file could not be read.')
        if len(content) > LETTER_MAX_BYTES:
            raise serializers.ValidationError('The file is too large. The limit is 5 MB.')
        if not content.startswith(signature):
            raise serializers.ValidationError('The file is not a valid PDF or Word document.')

        megabytes = len(content) / (1024 * 1024)
        return {
            'file_name': f'{stem[:100 - len(extension)]}{extension}',
            'size': f'{megabytes:.1f} MB' if megabytes >= 1 else f'{max(1, round(len(content) / 1024))} KB',
            'content_type': content_type,
            'data': encoded,
        }

class EntangledAnimalSerializer(serializers.Serializer):
    animal = serializers.CharField(max_length=100)
    condition = serializers.ChoiceField(choices=['alive', 'dead'])
    entangled_in = serializers.CharField(max_length=100, allow_blank=True, default='')


class TrashReportSerializer(serializers.Serializer):
    """The trash report required to finish a cleanup: the items counted, after the International
    Coastal Cleanup data card and grouped under the TROID classes (the class counts are their
    sums), and the site details. 0 is a valid answer; items left out count as 0."""
    site_type = serializers.ChoiceField(choices=[c for c, _ in Request.SITE_TYPE_CHOICES])
    people_count = serializers.IntegerField(min_value=1)
    hours_spent = serializers.FloatField(min_value=0, max_value=24 * 7)
    distance_km = serializers.FloatField(min_value=0, required=False, allow_null=True, default=None)
    bags = serializers.IntegerField(min_value=0)
    weight_kg = serializers.FloatField(min_value=0)
    non_usable_kg = serializers.FloatField(min_value=0)
    recyclable_kg = serializers.FloatField(min_value=0)
    trash_items = serializers.DictField(child=serializers.IntegerField(min_value=0))
    entangled_animals = EntangledAnimalSerializer(many=True, required=False, default=list)
    peculiar_item = serializers.CharField(max_length=200, allow_blank=True, default='')
    notes = serializers.CharField(allow_blank=True, default='')

    def validate_trash_items(self, value):
        unknown = sorted(set(value) - set(TRASH_ITEMS))
        if unknown:
            raise serializers.ValidationError(f'Not an item on the report: {", ".join(unknown)}.')
        return {item: value.get(item, 0) for item in TRASH_ITEMS}

class DetectionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionEvent
        fields = ['id', 'boat', 'timestamp', 'latitude', 'longitude', 'trash_count', 'categories', 'confidence', 'is_verified']

class BoatSerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(source='is_connected', read_only=True)
    # Who is using the robot right now through the Companion app (Boat.current_operator).
    in_use_by_name = serializers.SerializerMethodField()
    in_use_since = serializers.SerializerMethodField()

    class Meta:
        model = Boat
        fields = ['id', 'name', 'is_active', 'is_online', 'archived', 'last_latitude', 'last_longitude', 'battery_level',
                  'last_seen', 'in_use_by_name', 'in_use_since']

    def get_in_use_by_name(self, boat):
        operator = boat.current_operator
        return operator.name if operator else None

    def get_in_use_since(self, boat):
        return boat.in_use_since if boat.current_operator else None

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'user_id', 'name', 'email', 'role', 'status', 'location', 'date_created', 'must_change_password']

    def validate(self, attrs):
        # Only one account per email may be other than archived; the rest are kept for the record.
        email = attrs.get('email', getattr(self.instance, 'email', ''))
        account_status = attrs.get('status', getattr(self.instance, 'status', 'active'))
        if account_status != 'archived':
            others = User.unarchived_with_email(email)
            if self.instance is not None:
                others = others.exclude(pk=self.instance.pk)
            if others.exists():
                raise serializers.ValidationError({'email': f"{email} is already used by an account that isn't archived. Archive that account first."})
        return attrs

    def validate_role(self, value):
        # Operator logins come only from Operator Management (OperatorViewSet.create),
        # which links them to an operator record so they can use the Companion app.
        if value == 'operator' and getattr(self.instance, 'role', None) != 'operator':
            raise serializers.ValidationError('Add operators in Operator Management.')
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

class OperatorSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()

    def get_email(self, obj):
        return obj.user.email if obj.user else None

    def get_account_status(self, obj):
        return obj.user.status if obj.user else None

    class Meta:
        model = Operator
        fields = ['id', 'operator_id', 'name', 'status', 'assigned_bot', 'availability', 'archived', 'user', 'email', 'account_status']
        extra_kwargs = {
            'operator_id': {'required': False, 'allow_blank': True},
            'user': {'read_only': True},
        }

class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StatusHistory
        fields = ['id', 'request', 'label', 'date', 'actor', 'role', 'state', 'details']

class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ['id', 'request', 'photo_id', 'label', 'date', 'image_data']

class RequestSerializer(serializers.ModelSerializer):
    status_history = StatusHistorySerializer(many=True, read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)
    collection_area = serializers.PrimaryKeyRelatedField(
        queryset=CollectionArea.objects.all(), required=False, allow_null=True
    )
    collection_area_detail = serializers.SerializerMethodField()
    resend_available_at = serializers.SerializerMethodField()
    can_resend = serializers.SerializerMethodField()
    merged_into = serializers.SlugRelatedField(slug_field='request_id', read_only=True)
    merged_into_detail = serializers.SerializerMethodField()
    merged_requests = serializers.SerializerMethodField()

    def get_resend_available_at(self, obj):
        return obj.resend_available_at()

    def get_can_resend(self, obj):
        available = obj.resend_available_at()
        return available is not None and timezone.now() >= available

    def get_merged_into_detail(self, obj):
        """The request this one was merged into: its cleanup is this request's cleanup,
        so its progress and results are shown here too."""
        primary = obj.merged_into
        if primary is None:
            return None
        area = primary.collection_area
        return {
            'request_id': primary.request_id,
            'status': primary.status,
            'archived': primary.archived,
            'cleanup_type': primary.cleanup_type,
            'requested_by_name': primary.requested_by_name,
            'barangay': primary.barangay,
            'location_name': primary.location_name,
            'collection_area_detail': {'id': area.id, 'area_id': area.area_id, 'name': area.name} if area else None,
            'preferred_date': primary.preferred_date,
            'preferred_time': primary.preferred_time,
            'session_completed_at': primary.session_completed_at,
            'bags': primary.bags,
            'weight_kg': primary.weight_kg,
            'non_usable_kg': primary.non_usable_kg,
            'recyclable_kg': primary.recyclable_kg,
            'trash_categories': primary.trash_categories,
            **{field: getattr(primary, field) for field in TRASH_REPORT_FIELDS},
            'verified_categories': primary.verified_categories,
            'verified_at': primary.verified_at,
            'status_history': StatusHistorySerializer(primary.status_history.all(), many=True).data,
        }

    def get_merged_requests(self, obj):
        return [
            {
                'request_id': merged.request_id,
                'requested_by_name': merged.requested_by_name,
                'requested_by_role': merged.requested_by_role,
                'barangay': merged.barangay,
                'location_name': merged.location_name,
                'merged_at': merged.merged_at,
            }
            for merged in obj.merged_requests.all()
            if not merged.archived
        ]

    def get_collection_area_detail(self, obj):
        if not obj.collection_area:
            return None
        return {
            'id': obj.collection_area.id,
            'area_id': obj.collection_area.area_id,
            'name': obj.collection_area.name,
            # The trash report's site type starts from it.
            'water_body_type': obj.collection_area.water_body_type,
        }

    def validate(self, attrs):
        # TROID-supported cleanups are sent to a collection area; unsupported (manual) ones give
        # their location, and may name the area they are in (it then counts toward its priority).
        # Checked on new requests and whenever either choice changes.
        if self.instance is not None and not {'cleanup_type', 'collection_area', 'location_name'} & attrs.keys():
            return attrs
        current = self.instance
        cleanup_type = attrs.get('cleanup_type', getattr(current, 'cleanup_type', 'troid_supported'))
        area = attrs['collection_area'] if 'collection_area' in attrs else getattr(current, 'collection_area', None)
        location = (attrs.get('location_name', getattr(current, 'location_name', '')) or '').strip()
        if 'location_name' in attrs:
            attrs['location_name'] = location
        if cleanup_type == 'unsupported':
            if not location:
                raise serializers.ValidationError({'location_name': 'Enter where the cleanup will take place.'})
        elif area is None:
            raise serializers.ValidationError(
                {'collection_area': 'Choose a collection area. TROID-supported cleanups are sent to one.'}
            )
        return attrs

    class Meta:
        model = Request
        fields = ['id', 'request_id', 'request_type', 'cleanup_type', 'status', 'date_submitted', 'requested_by_name', 'requested_by_role', 'requested_by_barangay', 'contact', 'email', 'location_name', 'barangay', 'municipality', 'province', 'preferred_date', 'preferred_time', 'notes', 'decline_reason', 'parked_from_status', 'letter_file_name', 'letter_size', 'letter_content_type', 'bot_id', 'operator', 'collection_area', 'collection_area_detail', 'bags', 'weight_kg', 'non_usable_kg', 'recyclable_kg', 'session_completed_at', 'trash_categories', *TRASH_REPORT_FIELDS, 'verified_categories', 'verification_notes', 'verified_at', 'archived', 'status_history', 'photos', 'resent_at', 'resend_available_at', 'can_resend', 'merged_into', 'merged_into_detail', 'merged_from_status', 'merged_at', 'merged_requests']
        read_only_fields = ['resent_at', 'merged_from_status', 'merged_at', *TRASH_REPORT_FIELDS]
        extra_kwargs = {
            'request_id': {'required': False, 'allow_blank': True},
            'letter_file_name': {'read_only': True},
            'letter_size': {'read_only': True},
            'letter_content_type': {'read_only': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'requested_by_name': {'required': False, 'allow_blank': True},
            'requested_by_role': {'required': False, 'allow_blank': True},
            'contact': {'required': False, 'allow_blank': True},
            'location_name': {'required': False, 'allow_blank': True},
            'requested_by_barangay': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'municipality': {'required': False, 'allow_blank': True},
            'province': {'required': False, 'allow_blank': True},
            'preferred_date': {'required': False, 'allow_blank': True},
            'preferred_time': {'required': False, 'allow_blank': True},
        }

class DeploymentScheduleSerializer(serializers.ModelSerializer):
    bot = serializers.PrimaryKeyRelatedField(queryset=Boat.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        # A deployment for a request is the cleanup type the request was made as.
        request_id = attrs.get('request_id', getattr(self.instance, 'request_id', None))
        if request_id:
            cleanup_type = Request.objects.filter(request_id=request_id).values_list('cleanup_type', flat=True).first()
            if cleanup_type:
                attrs['cleanup_type'] = cleanup_type
        cleanup_type = attrs.get('cleanup_type', getattr(self.instance, 'cleanup_type', 'troid_supported'))
        status = attrs.get('status', getattr(self.instance, 'status', 'none'))

        if cleanup_type == 'unsupported':
            # A manual cleanup has no bot, so it never takes up a bot's day.
            if not request_id:
                raise serializers.ValidationError({'request_id': 'A non-TROID cleanup must be for a request.'})
            attrs['bot'] = None
            return attrs

        bot = attrs['bot'] if 'bot' in attrs else getattr(self.instance, 'bot', None)
        if bot is None:
            raise serializers.ValidationError({'bot': 'A TROID cleanup needs a bot.' if status == 'scheduled' else 'This field is required.'})
        day = attrs.get('day', getattr(self.instance, 'day', None))
        taken = DeploymentSchedule.objects.filter(bot=bot, day=day)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError({'non_field_errors': ['This bot already has a schedule on that day.']})
        return attrs

    class Meta:
        model = DeploymentSchedule
        fields = ['id', 'bot', 'day', 'status', 'label', 'zone', 'request_id', 'cleanup_type']
        # Bot + day uniqueness is checked in validate(): it only applies when there is a bot.
        validators = []

class LandfillRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandfillRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'bot', 'operator', 'vehicle', 'disposed_by']

class RecyclingRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecyclingRecord
        fields = ['id', 'record_id', 'barangay', 'date', 'bags', 'weight_kg', 'category', 'bot', 'operator', 'buyer', 'sold_at']

class SegregationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SegregationRecord
        fields = ['id', 'zone', 'date', 'total_bags', 'total_weight_kg', 'non_usable_weight_kg', 'recyclable_weight_kg', 'notes', 'created_at']

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ['id', 'time', 'user', 'role', 'action', 'details', 'module', 'ip', 'status']
        extra_kwargs = {
            'time': {'required': False, 'allow_blank': True},
            'ip': {'required': False, 'allow_blank': True},
        }


class CollectionAreaSerializer(serializers.ModelSerializer):
    # Only CENRO (admin) reviews areas; anyone else's values for these are ignored.
    REVIEW_FIELDS = ('status', 'decline_reason', 'reviewed_by', 'date_reviewed')
    TEXT_FIELDS = ('name', 'description', 'water_body_name', 'hazards')
    # How many cleanup requests were sent here; reshaping changes what their coverage is compared with.
    request_count = serializers.SerializerMethodField()

    def get_request_count(self, area):
        count = getattr(area, 'request_count', None)
        return count if count is not None else area.requests.filter(archived=False).count()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the area a name.')
        return value

    def validate_color(self, value):
        if value and not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise serializers.ValidationError('Use a colour like #1b4de4.')
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        if getattr(getattr(request, 'user', None), 'role', None) != 'admin':
            for field in self.REVIEW_FIELDS:
                attrs.pop(field, None)
            if self.instance is not None:
                # Only CENRO moves an area to another barangay.
                attrs.pop('barangay', None)
        for field in self.TEXT_FIELDS:
            if isinstance(attrs.get(field), str):
                attrs[field] = attrs[field].strip()

        area = self.instance
        # Renaming or recolouring an area leaves its shape alone, so only check a new or reshaped one.
        if area is not None and not {'points', 'barangay', 'closed'} & attrs.keys():
            return attrs
        barangay = attrs.get('barangay', area.barangay if area else '')
        points = attrs.get('points', area.points if area else [])
        closed = attrs.get('closed', area.closed if area else True)

        official = boundaries.canonical_barangay(barangay)
        if not official:
            raise serializers.ValidationError({'barangay': f'"{barangay}" is not a barangay of San Fernando.'})
        attrs['barangay'] = official
        if not isinstance(points, list) or not all(
            isinstance(p, (list, tuple)) and len(p) == 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in p)
            for p in points
        ):
            raise serializers.ValidationError({'points': 'Points must be [latitude, longitude] pairs.'})
        if len(points) < (3 if closed else 2):
            raise serializers.ValidationError({'points': 'Draw at least 3 points for an area, or 2 for a line.'})
        problem = boundaries.check_area(points, official)
        if problem:
            raise serializers.ValidationError({'points': problem})
        # A boat can only clean the waterway, so an area needs some inside it. One that is mostly
        # land is allowed; the browser warns its creator (utils/coverage.js areaWater).
        if water.area_water(points, closed)['status'] == 'none':
            raise serializers.ValidationError({'points': water.NO_WATER})
        return attrs

    class Meta:
        model = CollectionArea
        fields = [
            'id', 'area_id', 'name', 'barangay', 'submitted_by', 'points', 'closed', 'color',
            'description', 'water_body_type', 'water_body_name', 'hazards',
            'status', 'decline_reason', 'reviewed_by', 'date_submitted', 'date_reviewed', 'updated_by', 'date_updated',
            'archived', 'request_count',
        ]
        read_only_fields = ['updated_by', 'date_updated']
        extra_kwargs = {
            'area_id': {'read_only': True},
            'decline_reason': {'required': False, 'allow_blank': True},
            'reviewed_by': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'submitted_by': {'required': False, 'allow_blank': True},
            'color': {'required': False, 'allow_blank': True},
        }


class HeatmapDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeatmapData
        fields = ['id', 'latitude', 'longitude', 'weight', 'source_type', 'timestamp']


class NotificationSerializer(serializers.ModelSerializer):
    request_id = serializers.CharField(source='request.request_id', read_only=True, default=None)
    area_id = serializers.CharField(source='collection_area.area_id', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'recipient', 'request', 'request_id', 'collection_area', 'area_id', 'notif_type', 'title',
                  'message', 'is_read', 'created_at']
